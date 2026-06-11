import { Message } from "../models/message.model.js";
import { Connection } from "../models/connection.model.js";
import { User } from "../models/user.model.js";
import { redis } from "../lib/redis.js";
import { telegramService } from "../services/telegram.service.js";
import { socketAuth } from "../middleware/auth.middleware.js";

/* ═══════════════════════════════════════════════════════════════
   HELPER — verify two users are connected before allowing message
═══════════════════════════════════════════════════════════════ */
const areConnected = async (userA, userB) => {
  const conn = await Connection.findOne({
    $or: [
      { sender: userA, receiver: userB },
      { sender: userB, receiver: userA },
    ],
    status: "accepted",
  });
  return !!conn;
};

// In-memory map: userId → setTimeout handle (grace period timers)
const disconnectTimers = new Map();

export default function initSocket(io) {

  /* ─────────────────────────────────────────────────────────────
     GLOBAL SOCKET AUTH MIDDLEWARE
     Every socket connection must pass JWT verification first.
     socket.user = { id, username, avatar } after this runs.
  ───────────────────────────────────────────────────────────── */
  io.use(socketAuth);

  io.on("connection", async (socket) => {

    const userId = socket.user.id;

    console.log(`[Socket] ${socket.user.username} (${userId}) connected — socket ${socket.id}`);

    /* ─────────────────────────────────────────────────────────
       ONLINE TRACKING
    ───────────────────────────────────────────────────────── */

    // Cancel any pending offline timer (reconnect within grace period)
    const pendingTimer = disconnectTimers.get(userId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      disconnectTimers.delete(userId);
      console.log(`[Socket] ${userId} reconnected — offline timer cancelled`);
    }

    await redis.sadd(`user:${userId}:sockets`, socket.id);
    await redis.sadd("online:users", userId);
    socket.join(userId);

    // If this is the user's first socket (first device), broadcast online status
    const sockets = await redis.smembers(`user:${userId}:sockets`);
    if (sockets.length === 1) {
      socket.broadcast.emit("user:online", { userId });
    }

    // Send current online list to this socket only
    const onlineUsers = await redis.smembers("online:users");
    socket.emit("online:list", { users: onlineUsers });

    /* ─────────────────────────────────────────────────────────
       PRIVATE MESSAGE
       Payload: {
         message: {
           tempId, to, type, content, caption,
           replyTo, clientTime, fileName, fileSize,
           cover, thumb
         }
       }
    ───────────────────────────────────────────────────────── */
    socket.on("private_message", async (payload) => {
      try {
        const {
          tempId, to, type, content = null,
          caption = null, replyTo = null,
          clientTime, fileName = null, fileSize = null,
          cover = null, thumb = null,
        } = payload.message || {};

        if (!tempId || !to || !type) return;

        // ── Security: only connected users can message each other ──
        const connected = await areConnected(userId, to);
        if (!connected) {
          socket.emit("message_error", {
            tempId,
            code: "NOT_CONNECTED",
            message: "You are not connected with this user",
          });
          return;
        }

        const now = Date.now();

        // Cache sender for delivery ACK lookup
        await redis.set(`msg:${tempId}:from`, userId, "EX", 86400);

        // Deliver to receiver instantly
        io.to(to).emit("private_message", {
          id: tempId,
          from: userId,
          type,
          content,
          fileName,
          fileSize,
          caption,
          replyTo,
          cover,
          thumb,
          timestamp: now,
          status: { delivered: false },
        });

        // Sync to sender's other devices
        socket.to(userId).emit("private_message_sync", {
          tempId, to, type, content, fileName, fileSize,
          caption, cover, thumb, timestamp: now,
        });

        // Ack to sender immediately
        socket.emit("message_ack", { tempId, status: "sent" });

        // Persist to DB (async, non-blocking)
        Message.create({
          tempId,
          from: userId,
          to,
          type,
          content,
          fileName,
          fileSize,
          caption,
          cover,
          thumb,
          replyTo,
          clientTime,
          status: { sent: true, delivered: false, seen: false },
        })
          .then(() => socket.emit("message_saved", { tempId }))
          .catch((err) => {
            console.error("[Socket] Message save failed:", err.message);
            socket.emit("message_save_failed", { tempId });
          });

        // Telegram fallback — notify offline receiver
        const receiverSockets = await redis.smembers(`user:${to}:sockets`);
        if (!receiverSockets.length) {
          const [receiver, sender] = await Promise.all([
            User.findById(to).select("telegramChatId notificationsEnabled"),
            User.findById(userId).select("username"),
          ]);

          if (receiver?.telegramChatId && receiver?.notificationsEnabled) {
            const senderName = sender?.username || "Someone";
            const preview = type === "text"
              ? (content || "").substring(0, 50)
              : (caption || `Sent a ${type}`);

            const notification = telegramService.formatMessageNotification(
              senderName, type, preview
            );
            await telegramService.sendNotification(receiver.telegramChatId, notification);
          }
        }

      } catch (err) {
        console.error("[Socket] private_message error:", err);
      }
    });

    /* ─────────────────────────────────────────────────────────
       DELIVERY ACK
    ───────────────────────────────────────────────────────── */
    socket.on("message:received", async ({ tempId }) => {
      try {
        const updatedMsg = await Message.findOneAndUpdate(
          { tempId, to: userId },
          { $set: { "status.delivered": true, deliveredAt: new Date() } },
          { returnDocument: 'after' }
        );

        if (!updatedMsg) return;

        const senderId = updatedMsg.from.toString();
        io.to(senderId).emit("message:delivered", { tempId });

      } catch (err) {
        console.error("[Socket] message:received error:", err);
      }
    });

    /* ─────────────────────────────────────────────────────────
       SYNC UNDELIVERED ON RECONNECT
    ───────────────────────────────────────────────────────── */
    socket.on("sync:delivered", async () => {
      try {
        const undelivered = await Message.find({
          to: userId,
          "status.delivered": false,
        }).select("tempId from type content caption cover thumb replyTo fileName fileSize callType callStatus callRoomId callExpiresAt callDuration createdAt");

        for (const msg of undelivered) {
          socket.emit("private_message", {
            id: msg.tempId,
            from: msg.from.toString(),
            type: msg.type,
            content: msg.content,
            caption: msg.caption,
            cover: msg.cover || null,
            thumb: msg.thumb || null,
            replyTo: msg.replyTo,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
            callType: msg.callType,
            callStatus: msg.callStatus,
            callRoomId: msg.callRoomId,
            callExpiresAt: msg.callExpiresAt,
            callDuration: msg.callDuration,
            timestamp: msg.createdAt,
            status: { delivered: false },
          });
        }
      } catch (err) {
        console.error("[Socket] sync:delivered error:", err);
      }
    });

    /* ─────────────────────────────────────────────────────────
       TYPING
    ───────────────────────────────────────────────────────── */
    socket.on("typing:start", ({ to }) => {
      io.to(to).emit("typing:start", { user: userId });
    });

    socket.on("typing:stop", ({ to }) => {
      io.to(to).emit("typing:stop", { user: userId });
    });

    /* ─────────────────────────────────────────────────────────
       MEDIA UPLOADED — update DB with real URL after upload
    ───────────────────────────────────────────────────────── */
    socket.on("media:uploaded", async (payload) => {
      try {
        const { to, tempId, url, mediaType, cover, thumb } = payload;
        if (!tempId) return;

        const emitPayload = { tempId, url, mediaType, cover, thumb, mediaReady: true };

        io.to(to).emit("media:uploaded", emitPayload);
        io.to(userId).emit("media:uploaded", emitPayload);

        Message.updateOne(
          { tempId, from: userId },
          {
            $set: {
              content: url,
              type: mediaType,
              cover: cover || null,
              thumb: thumb || null,
              "status.mediaReady": true,
            },
          }
        ).catch((err) => console.error("[Socket] Media save failed:", err.message));

      } catch (err) {
        console.error("[Socket] media:uploaded error:", err);
      }
    });

    /* ─────────────────────────────────────────────────────────
       SEEN STATUS
    ───────────────────────────────────────────────────────── */
    socket.on("chat:seen", async ({ from }) => {
      try {
        const senderSockets = await redis.smembers(`user:${from}:sockets`);
        if (senderSockets.length) {
          senderSockets.forEach((sid) => {
            io.to(sid).emit("message:seen", { by: userId });
          });
        }

        socket.to(userId).emit("chat:seen_sync", { from });

        Message.updateMany(
          { from, to: userId, "status.seen": false },
          { $set: { "status.seen": true, "status.delivered": true, seenAt: new Date() } }
        ).catch((err) => console.error("[Socket] Seen save failed:", err.message));

      } catch (err) {
        console.error("[Socket] chat:seen error:", err);
      }
    });

    /* ─────────────────────────────────────────────────────────
       MOMENT REQUEST
    ───────────────────────────────────────────────────────── */
    socket.on("moment:request", async ({ to }) => {
      try {
        if (!to) return;
        const receiverSockets = await redis.smembers(`user:${to}:sockets`);
        if (receiverSockets.length) {
          receiverSockets.forEach((sid) => {
            io.to(sid).emit("client:capture_moment");
          });
        }
      } catch (err) {
        console.error("[Socket] moment:request error:", err);
      }
    });

    /* ─────────────────────────────────────────────────────────
       CONNECTION REQUEST NOTIFICATIONS (real-time)
       When user A sends a request to user B, user B gets notified
       if they're online.
    ───────────────────────────────────────────────────────── */
    /* ─────────────────────────────────────────────────────────
       CALL SIGNALLING
       call:offer   { to, type, from }
       call:accept  { to, type }
       call:reject  { to }
       call:end     { to }
    ───────────────────────────────────────────────────────── */
    socket.on("call:offer", ({ to, type, from, sdp, roomId }) => {
      if (!to || !type) return;

      // Check if receiver is online
      redis.smembers(`user:${to}:sockets`).then(async (receiverSockets) => {
        const isOnline = receiverSockets.length > 0;
        try {
          // ALWAYS save call message to MongoDB
          const callMsg = await Message.create({
            tempId: roomId,
            from: userId,
            to,
            type: "call",
            callType: type,
            callStatus: "active",
            callRoomId: roomId,
            callExpiresAt: new Date(Date.now() + 3 * 60 * 1000), // 3 min window
            content: `${type === "video" ? "📹" : "📞"} ${type} call`,
            status: { sent: true, delivered: isOnline, seen: false },
          });

          if (isOnline) {
            // Receiver online — relay offer directly, and ALSO emit private_message call log
            io.to(to).emit("call:offer", { from, type, sdp, roomId });
            io.to(to).emit("private_message", {
              id: callMsg.tempId, // roomId is msg.id in client state
              from: userId,
              type: "call",
              content: callMsg.content,
              callType: type,
              callStatus: "active",
              callRoomId: roomId,
              callExpiresAt: callMsg.callExpiresAt,
              timestamp: callMsg.createdAt,
              status: { delivered: true },
            });
          } else {
            // Receiver offline — notify via call:missed_message so it updates their UI if they connect
            io.to(to).emit("call:missed_message", {
              message: {
                id: callMsg._id.toString(),
                tempId: roomId,
                type: "call",
                callType: type,
                callStatus: "active",
                callRoomId: roomId,
                callExpiresAt: callMsg.callExpiresAt,
                from: userId,
                timestamp: callMsg.createdAt,
              }
            });
            // Tell the caller receiver is offline — show waiting state
            socket.emit("call:receiver_offline", { roomId });

            // Telegram fallback — notify offline receiver
            const [receiverUser, senderUser] = await Promise.all([
              User.findById(to).select("telegramChatId notificationsEnabled"),
              User.findById(userId).select("username"),
            ]);

            if (receiverUser?.telegramChatId && receiverUser?.notificationsEnabled) {
              const senderName = senderUser?.username || "Someone";
              const icon = type === "video" ? "📹" : "📞";
              const notification = `${icon} <b>Incoming ${type} call from ${senderName}</b>\n\nOpen the chat to join the call!`;
              await telegramService.sendNotification(receiverUser.telegramChatId, notification);
            }
          }

          // Send back to the caller so they also get a private_message to sync status/outbox
          socket.emit("private_message", {
            id: callMsg.tempId, // roomId is msg.id in client state
            from: userId,
            type: "call",
            content: callMsg.content,
            callType: type,
            callStatus: "active",
            callRoomId: roomId,
            callExpiresAt: callMsg.callExpiresAt,
            timestamp: callMsg.createdAt,
            status: { delivered: isOnline },
          });

        } catch (err) {
          console.error("[Call] Failed to save call message:", err.message);
          // Fallback if DB save fails
          if (isOnline) {
            io.to(to).emit("call:offer", { from, type, sdp, roomId });
          }
        }
      });
    });

    // Receiver wants to rejoin an active call (clicked call message)
    socket.on("call:rejoin", ({ roomId, to }) => {
      if (!roomId || !to) return;
      // Tell the caller someone is joining
      io.to(to).emit("call:rejoin_request", { from: userId, roomId });
    });

    // Caller responds to rejoin with a fresh offer
    socket.on("call:rejoin_offer", ({ to, sdp, roomId, type }) => {
      if (!to || !sdp) return;
      io.to(to).emit("call:offer", {
        from: { id: userId, username: socket.user.username, avatar: socket.user.avatar },
        type,
        sdp,
        roomId,
        isRejoin: true,
      });
    });

    socket.on("call:accept", ({ to, type, sdp, roomId }) => {
      if (!to) return;
      io.to(to).emit("call:accept", { by: userId, type, sdp, roomId });
      // Update call message status to ended (no longer joinable)
      if (roomId) {
        Message.updateOne(
          { callRoomId: roomId, callStatus: "active" },
          { $set: { callStatus: "ended" } }
        ).catch(() => { });
      }
    });

    socket.on("call:reject", ({ to, roomId }) => {
      if (!to) return;
      io.to(to).emit("call:reject", { by: userId });
      if (roomId) {
        Message.updateOne(
          { callRoomId: roomId },
          { $set: { callStatus: "declined" } }
        ).catch(() => { });
      }
    });

    socket.on("call:end", ({ to, duration = 0, roomId }) => {
      if (!to) return;
      io.to(to).emit("call:end", { by: userId, duration });
      // Update call message to ended with duration
      if (roomId) {
        Message.updateOne(
          { callRoomId: roomId },
          { $set: { callStatus: "ended", callDuration: duration } }
        ).catch(() => { });
      }
    });

    socket.on("call:declined", ({ to, roomId }) => {
      if (!to) return;
      io.to(to).emit("call:declined_ack", { by: userId });
      if (roomId) {
        Message.updateOne(
          { callRoomId: roomId },
          { $set: { callStatus: "declined" } }
        ).catch(() => { });
      }
    });

    // WebRTC signalling relay
    socket.on("call:sdp", ({ to, sdp }) => {
      if (!to || !sdp) return;
      io.to(to).emit("call:sdp", { from: userId, sdp });
    });

    socket.on("call:ice", ({ to, candidate }) => {
      if (!to || !candidate) return;
      io.to(to).emit("call:ice", { from: userId, candidate });
    });

    socket.on("connection:request", ({ to }) => {
      io.to(to).emit("connection:new_request", {
        from: {
          id: userId,
          username: socket.user.username,
          avatar: socket.user.avatar,
        },
      });
    });

    socket.on("connection:accepted", ({ to }) => {
      io.to(to).emit("connection:accepted", {
        by: {
          id: userId,
          username: socket.user.username,
          avatar: socket.user.avatar,
        },
      });
    });

    /* ─────────────────────────────────────────────────────────
       REACTIONS — frontend emits "react", broadcast to both sides
    ───────────────────────────────────────────────────────── */
    socket.on("react", async ({ messageId, to, emoji }) => {
      try {
        if (!messageId || !to || !emoji) return;

        const reactionPayload = { messageId, userId, emoji };

        // Send to receiver
        io.to(to).emit("reaction", reactionPayload);
        // Send back to sender's other devices
        socket.to(userId).emit("reaction", reactionPayload);
        // Also confirm to this socket (so sender sees it instantly)
        socket.emit("reaction", reactionPayload);

        // Persist reaction to DB
        Message.findOneAndUpdate(
          { tempId: messageId },
          { $set: { [`reactions.${userId}`]: emoji } }
        ).catch((err) => console.error("[Socket] Reaction save failed:", err.message));

      } catch (err) {
        console.error("[Socket] react error:", err);
      }
    });

    /* ─────────────────────────────────────────────────────────
       DISCONNECT — with 30-second grace period
    ───────────────────────────────────────────────────────── */
    socket.on("disconnect", async (reason) => {
      console.log(`[Socket] ${userId} disconnected — ${reason}`);

      await redis.srem(`user:${userId}:sockets`, socket.id);

      const remaining = await redis.smembers(`user:${userId}:sockets`);
      if (remaining.length > 0) return; // other devices still connected

      // Cancel any existing offline timer
      const existing = disconnectTimers.get(userId);
      if (existing) {
        clearTimeout(existing);
        disconnectTimers.delete(userId);
      }

      const isHardDisconnect =
        reason === "server namespace disconnect" ||
        reason === "client namespace disconnect";

      if (isHardDisconnect) {
        await markUserOffline(userId, socket);
        return;
      }

      // 30-second grace period for network blips / mobile tab switches
      const timer = setTimeout(async () => {
        const current = await redis.smembers(`user:${userId}:sockets`);
        if (current.length > 0) {
          disconnectTimers.delete(userId);
          return;
        }
        await markUserOffline(userId, socket);
        disconnectTimers.delete(userId);
      }, 30_000);

      disconnectTimers.set(userId, timer);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════ */
async function markUserOffline(userId, socket) {
  try {
    await redis.srem("online:users", userId);
    socket.broadcast.emit("user:offline", { userId });
    await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
    console.log(`[Socket] ${userId} marked offline`);
  } catch (err) {
    console.error(`[Socket] markUserOffline failed:`, err.message);
  }
}
