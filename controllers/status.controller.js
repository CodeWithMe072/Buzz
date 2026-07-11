import mongoose from "mongoose";
import Status from "../models/status.model.js";
import { User } from "../models/user.model.js";
import { Connection } from "../models/connection.model.js";
import { redis } from "../lib/redis.js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Helper to extract key from R2 URL
function extractKeyFromUrl(url) {
    if (!url) return null;
    let target = url;
    if (target.includes("/api/media")) {
        target = "/api/media" + target.split("/api/media")[1];
    }
    if (target.startsWith("/api/media")) {
        try {
            const parsed = new URL(target, "http://localhost");
            return parsed.searchParams.get("key");
        } catch {
            return null;
        }
    }
    return null;
}

// POST /api/status
export const createStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { mediaUrl, mediaType, type, textContent, backgroundColor, font, caption, duration } = req.body;

    const statusType = type || mediaType;

    if (!statusType || !["image", "video", "text"].includes(statusType)) {
      return res.status(400).json({ status: false, message: "Invalid status type" });
    }

    if (statusType === "text" && !textContent) {
      return res.status(400).json({ status: false, message: "textContent is required for text status" });
    }

    if (statusType !== "text" && !mediaUrl) {
      return res.status(400).json({ status: false, message: "mediaUrl is required for media status" });
    }

    // Fetch user privacy settings
    const user = await User.findById(userId);
    const privacy = user?.statusPrivacy || { mode: "contacts", exceptList: [], onlyList: [] };

    let audience = "contacts";
    let audienceList = [];

    if (privacy.mode === "exceptContacts") {
      audience = "exceptContacts";
      audienceList = privacy.exceptList || [];
    } else if (privacy.mode === "onlyContacts") {
      audience = "onlyContacts";
      audienceList = privacy.onlyList || [];
    }

    // Video thumbnail if any
    let thumbnailUrl = null;
    if (statusType === "video") {
      thumbnailUrl = req.body.thumbnailUrl || req.body.cover_270 || null;
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    const newStatus = new Status({
      userId,
      type: statusType,
      mediaUrl,
      thumbnailUrl,
      textContent,
      backgroundColor,
      font,
      caption,
      duration: duration || (statusType === "video" ? 15 : 5),
      audience,
      audienceList,
      viewCount: 0,
      createdAt: new Date(),
      expiresAt
    });

    await newStatus.save();

    // Broadcast status:new to all mutual connections in real time
    if (req.io) {
      try {
        const connections = await Connection.find({
          $or: [{ sender: userId }, { receiver: userId }],
          status: "accepted",
        });
        const friendIds = connections.map((c) => {
          return c.sender.toString() === userId.toString()
            ? c.receiver.toString()
            : c.sender.toString();
        });

        const user = await User.findById(userId).select("_id username avatar");
        const payload = {
          statusId: newStatus._id.toString(),
          userId: userId.toString(),
          username: user?.username || "",
          avatar: user?.avatar || "",
          moment: {
            _id: newStatus._id.toString(),
            url: newStatus.mediaUrl || null,
            type: newStatus.type,
            textContent: newStatus.textContent || null,
            backgroundColor: newStatus.backgroundColor || null,
            caption: newStatus.caption || null,
            createdAt: newStatus.createdAt,
            expiresAt: newStatus.expiresAt,
            viewers: [],
          },
        };

        for (const friendId of friendIds) {
          req.io.to(friendId).emit("status:new", payload);
        }
        req.io.to(userId.toString()).emit("status:new", payload);
      } catch (broadcastErr) {
        console.error("[CreateStatus] broadcast error:", broadcastErr);
      }
    }

    res.status(201).json({ status: true, data: newStatus });
  } catch (err) {
    console.error("[CreateStatus]", err);
    res.status(500).json({ status: false, message: "Failed to create status" });
  }
};

// GET /api/status/feed
export const getStatusFeed = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find mutually accepted connections
    const connections = await Connection.find({
      $or: [{ sender: userId }, { receiver: userId }],
      status: "accepted",
    });

    const friendIds = connections.map((c) => {
      const isMe = c.sender.toString() === userId.toString();
      return isMe ? c.receiver : c.sender;
    });

    if (!friendIds.length) {
      return res.json({ status: true, moments: {} });
    }

    // Find active non-expired statuses for connections
    const now = new Date();
    const activeStatuses = await Status.find({
      userId: { $in: friendIds },
      expiresAt: { $gt: now }
    }).sort({ createdAt: 1 }); // oldest first to play in sequence

    // Retrieve the users' details
    const users = await User.find({ _id: { $in: friendIds } }).select("_id username avatar");
    const userMap = {};
    for (const u of users) {
      const isOnline = (await redis.smembers(`user:${u._id}:sockets`)).length > 0;
      userMap[u._id.toString()] = {
        id: u._id.toString(),
        username: u.username,
        avatar: u.avatar,
        online: isOnline
      };
    }

    const momentsMap = {};
    const viewerIdStr = userId.toString();

    for (const status of activeStatuses) {
      const fId = status.userId.toString();
      if (!userMap[fId]) continue;

      // Privacy Check:
      let isVisible = false;
      if (status.audience === "public") {
        isVisible = true;
      } else if (status.audience === "contacts") {
        // mutual connections are allowed
        isVisible = true;
      } else if (status.audience === "exceptContacts") {
        isVisible = !status.audienceList.some(id => id.toString() === viewerIdStr);
      } else if (status.audience === "onlyContacts") {
        isVisible = status.audienceList.some(id => id.toString() === viewerIdStr);
      }

      if (!isVisible) continue;
      
      if (!momentsMap[fId]) {
        momentsMap[fId] = {
          user: userMap[fId],
          moments: []
        };
      }
      
      momentsMap[fId].moments.push({
        _id: status._id.toString(),
        url: status.mediaUrl,
        type: status.type,
        mediaType: status.type, // compatibility
        thumbnailUrl: status.thumbnailUrl,
        textContent: status.textContent,
        backgroundColor: status.backgroundColor,
        font: status.font,
        caption: status.caption,
        duration: status.duration,
        createdAt: status.createdAt,
        expiresAt: status.expiresAt,
        viewers: status.viewers,
        viewCount: status.viewCount
      });
    }

    res.json({ status: true, moments: momentsMap });
  } catch (err) {
    console.error("[GetStatusFeed]", err);
    res.status(500).json({ status: false, message: "Failed to fetch status feed" });
  }
};

// GET /api/status/me
export const getMyStatuses = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const myActiveStatuses = await Status.find({
      userId: userId,
      expiresAt: { $gt: now }
    }).sort({ createdAt: 1 })
      .populate("viewers.userId", "username avatar"); // Populate viewers user details
    

    // Format to match moments format
    const formatted = myActiveStatuses.map(status => ({
      _id: status._id.toString(),
      mediaUrl: status.mediaUrl,
      mediaType: status.type, // compatibility
      type: status.type,
      textContent: status.textContent,
      backgroundColor: status.backgroundColor,
      font: status.font,
      caption: status.caption,
      duration: status.duration,
      viewers: status.viewers.map(v => ({
        userId: v.userId?._id?.toString() || v.userId?.toString(),
        username: v.userId?.username || "Someone",
        avatar: (v.userId?.avatar && v.userId?.avatar.length > 2) ? v.userId.avatar : (v.userId?.username ? v.userId.username.charAt(0).toUpperCase() : "S"),
        viewedAt: v.viewedAt
      })),
      viewCount: status.viewCount,
      createdAt: status.createdAt,
      expiresAt: status.expiresAt
    }));


    res.json({ status: true, data: formatted });
  } catch (err) {
    console.error("[GetMyStatuses]", err);
    res.status(500).json({ status: false, message: "Failed to fetch my statuses" });
  }
};

// POST /api/status/:id/view
export const markStatusViewed = async (req, res) => {
  try {
    const userId = req.user._id;
    const statusId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(statusId)) {
      return res.status(400).json({ status: false, message: "Invalid status ID" });
    }

    const status = await Status.findById(statusId);
    if (!status) {
      return res.status(404).json({ status: false, message: "Status not found" });
    }

    const hasViewed = status.viewers.some(v => v.userId.toString() === userId.toString());
    if (!hasViewed) {
      status.viewers.push({ userId, viewedAt: new Date() });
      status.viewCount = (status.viewCount || 0) + 1; // Increment denormalized counter
      await status.save();
    }

    res.json({ status: true, message: "Status marked as viewed" });
  } catch (err) {
    console.error("[MarkStatusViewed]", err);
    res.status(500).json({ status: false, message: "Failed to mark status as viewed" });
  }
};

// DELETE /api/status/:id
export const deleteStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const statusId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(statusId)) {
      return res.status(400).json({ status: false, message: "Invalid status ID" });
    }

    const deleted = await Status.findOneAndDelete({ _id: statusId, userId: userId });
    if (!deleted) {
      return res.status(404).json({ status: false, message: "Status not found or unauthorized" });
    }

    // Broadcast status:deleted to all mutual connections so their screens update in real time
    if (req.io) {
      try {
        const connections = await Connection.find({
          $or: [{ sender: userId }, { receiver: userId }],
          status: "accepted",
        });
        const friendIds = connections.map((c) => {
          return c.sender.toString() === userId.toString()
            ? c.receiver.toString()
            : c.sender.toString();
        });

        const payload = { statusId: statusId.toString(), userId: userId.toString() };
        for (const friendId of friendIds) {
          req.io.to(friendId).emit("status:deleted", payload);
        }
        // Also emit to the deleting user's other sessions/tabs
        req.io.to(userId.toString()).emit("status:deleted", payload);
      } catch (broadcastErr) {
        console.error("[DeleteStatus] broadcast error:", broadcastErr);
      }
    }

    res.json({ status: true, message: "Status deleted successfully" });
  } catch (err) {
    console.error("[DeleteStatus]", err);
    res.status(500).json({ status: false, message: "Failed to delete status" });
  }
};
