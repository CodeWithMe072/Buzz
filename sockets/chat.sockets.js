import { Message } from "../models/message.model.js";

const onlineUsers = new Map();

export default function initSocket(io) {
  io.on("connection", (socket) => {
    const userId = socket.handshake.auth.userId;
    if (!userId) return socket.disconnect(true);

    onlineUsers.set(userId, socket.id);

    socket.broadcast.emit("user:online", { userId });
    socket.emit("online:list", {
      users: Array.from(onlineUsers.keys())
    });

    socket.on("private_message", (payload) => {
      console.log(payload)
      const {
        tempId, to, type, content, caption, replyTo, clientTime
      } = payload.message;

      if (!tempId || !to || !type || !content) return;

      const receiverSocketId = onlineUsers.get(to);

      if (receiverSocketId) {
        io.to(receiverSocketId).emit("private_message", {
          id: tempId,
          from: userId,
          type,
          content,
          caption,
          replyTo,
          timestamp: Date.now(),
          showTime:Date.now() - Math.random() * 86400000,
          status: { delivered: true }
        });
      }

      socket.emit("message_ack", { tempId, status: "sent" });

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
          delivered: Boolean(receiverSocketId),
          seen: false
        }
      }).then(doc => {
        socket.emit("message_saved", {
          tempId,
          mongoId: doc._id
        });
      }).catch(console.error);
    });

    socket.on("typing:start", ({ to }) => {
      const target = onlineUsers.get(to);
      if (target) io.to(target).emit("typing:start", { user: userId });
    });

    socket.on("typing:stop", ({ to }) => {
      const target = onlineUsers.get(to);
      if (target) io.to(target).emit("typing:stop", { user: userId });
    });

    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      socket.broadcast.emit("user:offline", { userId });
    });
  });
}
