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
                // ── FIX: select cover + thumb so receiver gets them on sync ──
                const undelivered = await Message.find({
                    to: userId,
                    "status.delivered": false
                }).select("tempId from type content caption cover thumb replyTo createdAt");

                undelivered.forEach(msg => {
                    socket.emit("private_message", {
                        id: msg.tempId,
                        from: msg.from,
                        type: msg.type,
                        content: msg.content,
                        caption: msg.caption,
                        cover: msg.cover || null,   // ← NEW
                        thumb: msg.thumb || null,   // ← NEW
                        replyTo: msg.replyTo,
                        timestamp: msg.createdAt,
                        status: { delivered: false }
                    });
                });
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
                console.log(senderSockets)
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

        /* =============================
           DISCONNECT
        ============================== */

        socket.on("disconnect", async () => {

            await redis.srem(`user:${userId}:sockets`, socket.id);

            const sockets = await redis.smembers(`user:${userId}:sockets`);

            if (!sockets.length) {

                await redis.srem("online:users", userId);
                socket.broadcast.emit("user:offline", { userId });

                await User.updateOne(
                    { extra: userId },
                    { $set: { lastSeen: new Date() } }
                );
            }
        });
    });
}