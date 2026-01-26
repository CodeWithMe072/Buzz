// socket/socket.js
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import { telegramService } from "../services/telegram.service.js";

const onlineUsers = new Map();

export default function initSocket(io) {
  io.on("connection", (socket) => {
    const userId = socket.handshake.auth.userId;
    if (!userId) return socket.disconnect(true);

    onlineUsers.set(userId, socket.id);
    
    // 🔥 BULK DELIVERY ON CONNECT
    Message.find({
      to: userId,
      "status.delivered": false
    })
      .select("tempId from")
      .then((messages) => {
        if (!messages.length) return;

        Message.updateMany(
          {
            to: userId,
            "status.delivered": false
          },
          {
            $set: {
              "status.delivered": true,
              deliveredAt: new Date()
            }
          }
        ).catch(console.error);

        for (const msg of messages) {
          const senderSocketId = onlineUsers.get(msg.from);
          if (!senderSocketId) continue;

          io.to(senderSocketId).emit("message:delivered", {
            tempId: msg.tempId
          });
        }
      })
      .catch(console.error);
      
    socket.broadcast.emit("user:online", { userId });
    socket.emit("online:list", {
      users: Array.from(onlineUsers.keys())
    });

    socket.on("private_message", async (payload) => {
      const {
        tempId, to, type, caption, replyTo, clientTime
      } = payload.message;
      let { content } = payload.message;

      if (!tempId || !to || !type) return;

      const receiverSocketId = onlineUsers.get(to);
      const isReceiverOnline = Boolean(receiverSocketId);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit("private_message", {
          id: tempId,
          from: userId,
          type,
          content,
          caption,
          replyTo,
          timestamp: Date.now(),
          status: { delivered: true }
        });
      }

      socket.emit("message_ack", { tempId, status: "sent" });
      content = content ? content : " ";

      // 🔥 SEND TELEGRAM NOTIFICATION IF USER IS OFFLINE
      if (!isReceiverOnline) {
        try {
          const [receiver, sender] = await Promise.all([
            User.findById(to).select('telegramChatId notificationsEnabled'),
            User.findById(userId).select('username name')
          ]);

          if (receiver?.telegramChatId && receiver?.notificationsEnabled) {
            const senderName = sender?.name || sender?.username || 'Someone';
            let messagePreview = '';

            switch(type) {
              case 'text':
                messagePreview = content.length > 50 
                  ? content.substring(0, 50) + '...' 
                  : content;
                break;
              case 'image':
                messagePreview = caption || 'Sent a photo';
                break;
              case 'video':
                messagePreview = caption || 'Sent a video';
                break;
              case 'audio':
                messagePreview = 'Sent a voice message';
                break;
              case 'file':
                messagePreview = caption || 'Sent a file';
                break;
              default:
                messagePreview = 'Sent a message';
            }

            const notification = telegramService.formatMessageNotification(
              senderName,
              type,
              messagePreview
            );

            await telegramService.sendNotification(
              receiver.telegramChatId,
              notification
            );
          }
        } catch (error) {
          console.error('Error sending Telegram notification:', error);
        }
      }

      Message.create({
        tempId,
        from: userId,
        to,
        type,
        content,
        caption,
        replyTo,
        clientTime,
        deletedFor: [],
        status: {
          sent: true,
          delivered: isReceiverOnline,
          seen: false
        }
      }).then(doc => {
        socket.emit("message_saved", {
          tempId,
          mongoId: doc._id
        });
      }).catch(console.error);
    });

    // ... rest of your socket handlers remain the same
    socket.on("typing:start", ({ to }) => {
      const target = onlineUsers.get(to);
      if (target) io.to(target).emit("typing:start", { user: userId });
    });

    socket.on("typing:stop", ({ to }) => {
      const target = onlineUsers.get(to);
      if (target) io.to(target).emit("typing:stop", { user: userId });
    });

    socket.on("media:uploaded", ({ tempId, to, url, mediaType }) => {
      const receiverSocketId = onlineUsers.get(to);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit("media:uploaded", {
          tempId,
          url,
          mediaType
        });
      }

      socket.emit("media:uploaded", {
        tempId,
        url,
        mediaType
      });

      Message.updateOne(
        { tempId },
        {
          $set: {
            content: url,
            type: mediaType,
          }
        }
      ).catch(err => {
        console.error("Mongo update failed:", err);
      });
    });

    socket.on("chat:seen", ({ from }) => {
      const to = userId;

      Message.updateMany(
        {
          from,
          to,
          "status.delivered": true,
          "status.seen": false
        },
        {
          $set: {
            "status.seen": true,
            seenAt: new Date()
          }
        }
      ).then(() => {
        const senderSocketId = onlineUsers.get(from);
        if (senderSocketId) {
          io.to(senderSocketId).emit("message:seen", {
            by: to
          });
        }
      }).catch(console.error);
    });

    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      socket.broadcast.emit("user:offline", { userId });
    });
  });
}