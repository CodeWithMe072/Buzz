// socket/socket.js
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import { telegramService } from "../services/telegram.service.js";

// Key: userId, Value: Set of socket IDs
const onlineUsers = new Map();

export default function initSocket(io) {
    io.on("connection", (socket) => {

        const userId = socket.handshake.auth?.userId;
        if (!userId) {
            socket.disconnect(true);
            return;
        }

        /* =============================
           MULTI DEVICE TRACKING
        ============================== */

        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set());
        }

        onlineUsers.get(userId).add(socket.id);
        socket.join(userId);

        const isFirstDevice = onlineUsers.get(userId).size === 1;

        if (isFirstDevice) {
            socket.broadcast.emit("user:online", { userId });
        }

        socket.emit("online:list", {
            users: Array.from(onlineUsers.keys())
        });

        /* =============================
           PRIVATE MESSAGE
        ============================== */

        socket.on("private_message", async (payload) => {
            try {
                const { tempId, to, type, caption, replyTo, clientTime } = payload.message;
                let { content } = payload.message;

                if (!tempId || !to || !type) return;

                content = content || " ";

                const receiverSockets = onlineUsers.get(to);
                const isReceiverOnline = receiverSockets && receiverSockets.size > 0;

                // 1️⃣ SAVE FIRST (prevents ghost messages)
                const newMessage = await Message.create({
                    tempId,
                    from: userId,
                    to,
                    type,
                    content,
                    caption,
                    replyTo,
                    clientTime,
                    status: {
                        sent: true,
                        delivered: false,
                        seen: false
                    }
                });

                socket.emit("message_saved", {
                    tempId,
                    mongoId: newMessage._id
                });

                // 2️⃣ EMIT TO RECEIVER DEVICES
                io.to(to).emit("private_message", {
                    id: tempId,
                    from: userId,
                    type,
                    content,
                    caption,
                    replyTo,
                    timestamp: Date.now(),
                    status: { delivered: false }
                });

                // 3️⃣ SYNC TO SENDER OTHER DEVICES
                socket.to(userId).emit("private_message_sync", {
                    tempId,
                    to,
                    type,
                    content,
                    caption,
                    timestamp: Date.now()
                });

                socket.emit("message_ack", {
                    tempId,
                    status: "sent"
                });

                // 4️⃣ DELIVERY UPDATE (only if online)
                if (isReceiverOnline) {
                    await Message.updateOne(
                        { _id: newMessage._id },
                        {
                            $set: {
                                "status.delivered": true,
                                deliveredAt: new Date()
                            }
                        }
                    );

                    io.to(userId).emit("message:delivered", { tempId });
                }

                // 5️⃣ TELEGRAM NOTIFICATION (ONLY if fully offline)
                if (!isReceiverOnline) {
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
           DELIVERY SYNC AFTER CONNECT
        ============================== */

        socket.on("sync:delivered", async () => {
            try {
                const undelivered = await Message.find({
                    to: userId,
                    "status.delivered": false
                }).select("_id tempId from");

                if (!undelivered.length) return;

                const ids = undelivered.map(m => m._id);

                await Message.updateMany(
                    { _id: { $in: ids } },
                    {
                        $set: {
                            "status.delivered": true,
                            deliveredAt: new Date()
                        }
                    }
                );

                undelivered.forEach(msg => {
                    io.to(msg.from).emit("message:delivered", {
                        tempId: msg.tempId
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
        ============================== */

        socket.on("media:uploaded", async (payload) => {
            try {
                const { to, tempId, url, mediaType, cover, thumb } = payload;

                if (!tempId) return;

                // 1️⃣ Update DB first (single source of truth)
                const updated = await Message.findOneAndUpdate(
                    { tempId, from: userId },
                    {
                        $set: {
                            content: url,
                            type: mediaType,
                            cover,
                            thumb,
                            "status.mediaReady": true
                        }
                    },
                    { new: true }
                );

                if (!updated) return;

                const emitPayload = {
                    tempId,
                    url,
                    mediaType,
                    cover,
                    thumb,
                    mediaReady: true
                };

                // 2️⃣ Emit to RECEIVER (all devices)
                io.to(to).emit("media:uploaded", emitPayload);

                // 3️⃣ Emit to SENDER (all devices including uploader)
                io.to(userId).emit("media:uploaded", emitPayload);

            } catch (err) {
                console.error("Media update failed:", err);
            }
        });

        /* =============================
           SEEN STATUS
        ============================== */

        socket.on("chat:seen", async ({ from }) => {
            try {
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

                io.to(from).emit("message:seen", { by: userId });
                socket.to(userId).emit("chat:seen_sync", { from });

            } catch (error) {
                console.error("Seen update error:", error);
            }
        });

        /* =============================
           DISCONNECT
        ============================== */

        socket.on("disconnect", async () => {
            const userSockets = onlineUsers.get(userId);

            if (!userSockets) return;

            userSockets.delete(socket.id);

            if (userSockets.size === 0) {
                onlineUsers.delete(userId);

                socket.broadcast.emit("user:offline", { userId });

                try {
                    await User.updateOne(
                        { extra: userId },
                        { $set: { lastSeen: new Date() } }
                    );
                } catch (err) {
                    console.error("LastSeen update failed:", err);
                }
            }
        });
    });
}