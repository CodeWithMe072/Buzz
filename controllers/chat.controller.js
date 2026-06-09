import mongoose from "mongoose";
import { Message } from "../models/message.model.js";
import { Connection } from "../models/connection.model.js";

/* ═══════════════════════════════════════════════════════════
   HELPER — verify two users are connected (accepted)
═══════════════════════════════════════════════════════════ */
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


/* ═══════════════════════════════════════════════════════════
   GET ALL MESSAGES
   POST /api/messages
   Body: { receiverId, limit?, before? }
   Protected: requires JWT
   
   Only returns messages if a valid connection exists
═══════════════════════════════════════════════════════════ */
export const getMessages = async (req, res) => {
  try {
    const { receiverId, limit = 50, before = null } = req.body;
    const myId = req.user._id;

    if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ status: false, message: "Valid receiverId is required" });
    }

    // Only connected users can read each other's messages
    const connected = await areConnected(myId, receiverId);
    if (!connected) {
      return res.status(403).json({
        status: false,
        message: "You are not connected with this user",
      });
    }

    const query = {
      $or: [
        { from: myId, to: receiverId },
        { from: receiverId, to: myId },
      ],
      deletedFor: { $nin: [myId] },
    };

    // Cursor-based pagination: load older messages
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .select("-__v -deletedFor");

    res.json({
      status: true,
      count: messages.length,
      messages: messages.reverse(), // oldest first for rendering
    });

  } catch (err) {
    console.error("[GetMessages]", err);
    res.status(500).json({ status: false, message: "Failed to fetch messages" });
  }
};


/* ═══════════════════════════════════════════════════════════
   DELETE CHAT (delete for me)
   DELETE /api/chat/:userId
   Protected: requires JWT
═══════════════════════════════════════════════════════════ */
export const deleteChat = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ status: false, message: "Invalid userId" });
    }

    await Message.updateMany(
      {
        $or: [
          { from: myId, to: userId },
          { from: userId, to: myId },
        ],
      },
      { $addToSet: { deletedFor: myId } }
    );

    res.json({ status: true, message: "Chat deleted" });

  } catch (err) {
    console.error("[DeleteChat]", err);
    res.status(500).json({ status: false, message: "Failed to delete chat" });
  }
};


/* ═══════════════════════════════════════════════════════════
   GET MEDIA
   GET /api/chat/:userId/media
   Protected: requires JWT
   Returns all image/video/document messages in this chat
═══════════════════════════════════════════════════════════ */
export const getMedia = async (req, res) => {
  try {
    const { userId } = req.params;
    const myId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ status: false, message: "Invalid userId" });
    }

    const connected = await areConnected(myId, userId);
    if (!connected) {
      return res.status(403).json({ status: false, message: "Not connected" });
    }

    const media = await Message.find({
      $or: [
        { from: myId, to: userId },
        { from: userId, to: myId },
      ],
      type: { $in: ["image", "video", "document", "audio"] }
    })
      .sort({ createdAt: -1 })
      .select("tempId type content cover thumb caption fileName fileSize createdAt from");

    res.json({ status: true, count: media.length, data: media });

  } catch (err) {
    console.error("[GetMedia]", err);
    res.status(500).json({ status: false, message: "Failed to fetch media" });
  }
};
