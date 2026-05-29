import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import { telegramService } from "../services/telegram.service.js";
import { redis } from "../lib/redis.js";
export default function initSocket(io) {

    io.on("connection", async (socket) => {

        const userId = socket.handshake.auth?.userId;
        if (!userId) return socket.disconnect(true);

        /* =============================
           MULTI DEVICE TRACKING
        ============================== */

        // ── Cancel any pending offline timer for this user (reconnect within grace period) ──
        const pendingTimer = disconnectTimers.get(userId);
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            disconnectTimers.delete(userId);
            console.log(`[RECONNECT] ${userId} reconnected within grace period — offline timer cancelled`);
        }

        await redis.sadd(`user:${userId}:sockets`, socket.id);
        await redis.sadd("online:users", userId);
        socket.join(userId);

        const sockets = await redis.smembers(`user:${userId}:sockets`);
        const isFirstDevice = sockets.length === 1;

        if (isFirstDevice) {
            socket.broadcast.emit("user:online", { userId });
        }

        const users = await redis.smembers("online:users");
        socket.emit("online:list", { users });

        /* =============================
           PRIVATE MESSAGE
        ============================== */

        socket.on("private_message", async (payload) => {
            try {
                const { tempId, to, type, caption, replyTo, clientTime, fileName = null, fileSize = null } = payload.message;
                let { content } = payload.message;

                // ── FIX: also extract cover and thumb (sent by client after media upload) ──
                const cover = payload.message.cover || null;
                const thumb = payload.message.thumb || null;

                if (!tempId || !to || !type) return;

                content = content || null;
                const now = Date.now();

                // Cache sender for delivery ACK
                await redis.set(`msg:${tempId}:from`, userId, "EX", 86400);

                // Emit to receiver instantly — include cover + thumb so they can show thumbnail
                io.to(to).emit("private_message", {
                    id: tempId,
                    from: userId,
                    type,
                    content,
                    fileName,
                    fileSize,
                    caption,
                    replyTo,
                    cover,      // ← NEW: video cover / image preview
                    thumb,      // ← NEW: small thumbnail
                    timestamp: now,
                    status: { delivered: false }
                });

                // Sync to sender's other devices
                socket.to(userId).emit("private_message_sync", {
                    tempId,
                    to,
                    type,
                    content,
                    fileName,
                    fileSize,
                    caption,
                    cover,
                    thumb,
                    timestamp: now
                });

                socket.emit("message_ack", {
                    tempId,
                    status: "sent"
                });

                // Save to DB async — include cover + thumb
                (async () => {
                    try {
                        await Message.create({
                            tempId,
                            from: userId,
                            to,
                            type,
                            content,
                            fileName,
                            fileSize,
                            caption,
                            cover,   // ← NEW
                            thumb,   // ← NEW
                            replyTo,
                            clientTime,
                            status: {
                                sent: true,
                                delivered: false,
                                seen: false
                            }
                        });
                        socket.emit("message_saved", { tempId });
                    } catch (err) {
                        console.error("Message Save Failed:", err);
                        socket.emit("message_save_failed", { tempId });
                    }
                })();

                // Telegram fallback
                const receiverSockets = await redis.smembers(`user:${to}:sockets`);
                if (!receiverSockets.length) {

                    const receiver = await User.findOne({ extra: to })
                        .select("telegramChatId notificationsEnabled");

                    if (receiver?.telegramChatId && receiver?.notificationsEnabled) {

                        const sender = await User.findOne({ extra: userId })
                            .select("username");

                        const senderName = sender?.username || "Someone";

                        const notification =
                            telegramService.formatMessageNotification(
                                senderName,
                                type,
                                type === "text"
                                    ? content.substring(0, 50)
                                    : (caption || `Sent a ${type}`)
                            );

                        await telegramService.sendNotification(
                            receiver.telegramChatId,
                            notification
                        );
                    }
                }

            } catch (error) {
                console.error("Private Message Error:", error);
            }
        });

        /* =============================
           DELIVERY ACK
        ============================== */

        socket.on("message:received", async ({ tempId }) => {
            try {

                const senderId = await redis.get(`msg:${tempId}:from`);
                if (!senderId) return;

                io.to(senderId).emit("message:delivered", { tempId });

                // Persist async
                (async () => {
                    try {
                        await Message.updateOne(
                            { tempId, to: userId },
                            {
                                $set: {
                                    "status.delivered": true,
                                    deliveredAt: new Date()
                                }
                            }
                        );
                    } catch (err) {
                        console.error("Delivery Save Failed:", err);
                    }
                })();

            } catch (err) {
                console.error("Delivery ACK failed:", err);
            }
        });

        /* =============================
           DELIVERY SYNC AFTER CONNECT
        ============================== */

        socket.on("sync:delivered", async () => {
            try {
                const undelivered = await Message.find({
                    to: userId,
                    "status.delivered": false
                }).select("tempId from type content caption cover thumb replyTo createdAt");

                for (const msg of undelivered) {
                    // FIX: skip if sender is online — they already sent it live,
                    // emitting again = duplicate on receiver
                    const senderSockets = await redis.smembers(`user:${msg.from}:sockets`);

                    // FIX: use socket.emit (only to THIS socket), not io.to(userId)
                    // io.to(userId) broadcasts to ALL devices of this user, causing
                    // duplicates on multi-device setups
                    socket.emit("private_message", {
                        id: msg.tempId,
                        from: msg.from,
                        type: msg.type,
                        content: msg.content,
                        caption: msg.caption,
                        cover: msg.cover || null,
                        thumb: msg.thumb || null,
                        replyTo: msg.replyTo,
                        timestamp: msg.createdAt,
                        status: { delivered: false }
                    });
                }
            } catch (error) {
                console.error("Delivery Sync Error:", error);
            }
        });

        /* =============================
           TYPING EVENTS
        ============================== */

        socket.on("typing:start", ({ to }) => {
            io.to(to).emit("typing:start", { user: userId });
        });

        socket.on("typing:stop", ({ to }) => {
            io.to(to).emit("typing:stop", { user: userId });
        });

        /* =============================
           MEDIA UPLOAD UPDATE
           NOTE: This is now only used to update the DB with the real URL
           after the client has already sent private_message with cover/thumb.
           The receiver already got the full message via private_message.
        ============================== */

        socket.on("media:uploaded", async (payload) => {
            try {

                const { to, tempId, url, mediaType, cover, thumb } = payload;
                if (!tempId) return;

                const emitPayload = {
                    tempId,
                    url,
                    mediaType,
                    cover,
                    thumb,
                    mediaReady: true
                };

                // Still emit to both sides for any UI that needs it
                io.to(to).emit("media:uploaded", emitPayload);
                io.to(userId).emit("media:uploaded", emitPayload);

                // Persist async — update content + cover + thumb in DB
                (async () => {
                    try {
                        await Message.updateOne(
                            { tempId, from: userId },
                            {
                                $set: {
                                    content: url,
                                    type: mediaType,
                                    cover: cover || null,
                                    thumb: thumb || null,
                                    "status.mediaReady": true
                                }
                            }
                        );
                    } catch (err) {
                        console.error("Media Save Failed:", err);
                    }
                })();

            } catch (err) {
                console.error("Media update failed:", err);
            }
        });

        /* =============================
           SEEN STATUS
        ============================== */

        socket.on("chat:seen", async ({ from }) => {

            try {

                const senderSockets = await redis.smembers(`user:${from}:sockets`);
                if (!senderSockets.length) return;
                senderSockets.forEach(socketId => {
                    io.to(socketId).emit("message:seen", { by: userId });
                });

                socket.to(userId).emit("chat:seen_sync", { from });

                await Message.updateMany(
                    {
                        from,
                        to: userId,
                        "status.delivered": true,
                        "status.seen": false
                    },
                    {
                        $set: {
                            "status.seen": true,
                            seenAt: new Date()
                        }
                    }
                );

            } catch (error) {
                console.error("Seen save failed:", error);
            }

        });

        /* ═══════════════════════════════════════════════════════════
           DISCONNECT — with grace period
           
           PROBLEM: Socket.io fires "disconnect" for ALL reasons including:
             - slow network blip (transport close, ping timeout)
             - browser tab switch on mobile (page hidden)
             - brief WiFi drop
           
           If we immediately clear Redis + broadcast offline, the user
           appears offline for a 1-second network hiccup.

           SOLUTION: 30-second grace period.
             - Always remove THIS socket.id from Redis immediately (socket is dead)
             - If user has no sockets left → wait 30s before marking offline
             - If they reconnect within 30s → cancel the timer, they stay online
             - If tab close / browser close / phone screen off → they won't
               reconnect, timer fires, they go offline correctly
        ═══════════════════════════════════════════════════════════ */

        socket.on("disconnect", async (reason) => {

            console.log(`[DISCONNECT] userId=${userId} socketId=${socket.id} reason=${reason}`);

            // ── Step 1: Always remove this dead socket ID ──
            await redis.srem(`user:${userId}:sockets`, socket.id);

            // ── Step 2: Check remaining sockets for this user ──
            const remainingSockets = await redis.smembers(`user:${userId}:sockets`);

            if (remainingSockets.length > 0) {
                // User still has other active connections (multi-device) → stay online
                console.log(`[DISCONNECT] ${userId} still has ${remainingSockets.length} socket(s) — staying online`);
                return;
            }

            // ── Step 3: No sockets left — start grace period ──
            // Cancel any previous pending offline timer for this user
            const existingTimer = disconnectTimers.get(userId);
            if (existingTimer) {
                clearTimeout(existingTimer);
                disconnectTimers.delete(userId);
            }

            console.log(`[DISCONNECT] ${userId} has no sockets — starting 30s grace period`);

            // Reasons that are definitely a hard disconnect (no reconnect coming):
            // "server namespace disconnect" = server called socket.disconnect()
            // "client namespace disconnect" = client called socket.disconnect() explicitly (logout)
            const isHardDisconnect =
                reason === "server namespace disconnect" ||
                reason === "client namespace disconnect";

            // For hard disconnects (logout, server kick) → go offline immediately, no grace
            if (isHardDisconnect) {
                await markUserOffline(userId, socket);
                return;
            }

            // For everything else (transport close, ping timeout, network blip,
            // tab close, browser close, phone screen off) → wait 30s
            // If they reconnect, the "connection" handler will cancel this timer
            const timer = setTimeout(async () => {
                // Double-check: did they reconnect in the meantime?
                const currentSockets = await redis.smembers(`user:${userId}:sockets`);
                if (currentSockets.length > 0) {
                    console.log(`[OFFLINE TIMER] ${userId} reconnected — cancelled`);
                    disconnectTimers.delete(userId);
                    return;
                }

                await markUserOffline(userId, socket);
                disconnectTimers.delete(userId);
            }, 30_000); // 30 second grace period

            disconnectTimers.set(userId, timer);
        });
    });
}

/* ═══════════════════════════════════════════════════════════
   SHARED HELPERS
═══════════════════════════════════════════════════════════ */

// In-memory map: userId → setTimeout handle
// Tracks pending "go offline" timers during grace period
const disconnectTimers = new Map();

async function markUserOffline(userId, socket) {
    try {
        await redis.srem("online:users", userId);
        socket.broadcast.emit("user:offline", { userId });
        await User.updateOne(
            { extra: userId },
            { $set: { lastSeen: new Date() } }
        );
        console.log(`[OFFLINE] ${userId} marked offline`);
    } catch (err) {
        console.error(`[OFFLINE] Failed to mark ${userId} offline:`, err);
    }
}