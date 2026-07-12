import mongoose from "mongoose";
import Status from "../models/status.model.js";
import { User } from "../models/user.model.js";
import { Connection } from "../models/connection.model.js";
import { redis } from "../lib/redis.js";

// ── Redis TTL ─────────────────────────────────────────────────────────────────
const STATUS_CACHE_TTL = 300; // 5 minutes

// ── Cache key helpers ─────────────────────────────────────────────────────────
// Per-poster key: holds that user's own active moments array (shared by all friends reading the feed)
const contribKey = (userId) => `status:feed:contrib:${userId}`;
// Per-owner key: holds the full /api/status/me response shape (includes populated viewers)
const meKey      = (userId) => `status:me:${userId}`;

// ── Helper: get mutual friend IDs for a user ──────────────────────────────────
async function getMutualFriendIds(userId) {
  const connections = await Connection.find({
    $or: [{ sender: userId }, { receiver: userId }],
    status: "accepted",
  });
  return connections.map((c) =>
    c.sender.toString() === userId.toString() ? c.receiver : c.sender
  );
}

// ── Helper: query active status moments for a list of user IDs ────────────────
async function queryStatusMomentsForUsers(userIds, viewerIdStr) {
  const now = new Date();
  const activeStatuses = await Status.find({
    userId: { $in: userIds },
    expiresAt: { $gt: now },
  }).sort({ createdAt: 1 });

  const users = await User.find({ _id: { $in: userIds } }).select("_id username avatar");
  const isOnlineMap = {};
  for (const u of users) {
    const sockets = await redis.smembers(`user:${u._id}:sockets`);
    isOnlineMap[u._id.toString()] = sockets.length > 0;
  }
  const userMap = {};
  for (const u of users) {
    userMap[u._id.toString()] = {
      id: u._id.toString(),
      username: u.username,
      avatar: u.avatar,
      online: isOnlineMap[u._id.toString()] || false,
    };
  }

  // Group by poster with privacy check
  const result = {}; // { [posterId]: { user, moments[] } }
  for (const status of activeStatuses) {
    const fId = status.userId.toString();
    if (!userMap[fId]) continue;

    let isVisible = false;
    if (status.audience === "public" || status.audience === "contacts") {
      isVisible = true;
    } else if (status.audience === "exceptContacts") {
      isVisible = !status.audienceList.some((id) => id.toString() === viewerIdStr);
    } else if (status.audience === "onlyContacts") {
      isVisible = status.audienceList.some((id) => id.toString() === viewerIdStr);
    }
    if (!isVisible) continue;

    if (!result[fId]) result[fId] = { user: userMap[fId], moments: [] };
    result[fId].moments.push({
      _id: status._id.toString(),
      url: status.mediaUrl,
      type: status.type,
      mediaType: status.type,
      thumbnailUrl: status.thumbnailUrl,
      textContent: status.textContent,
      backgroundColor: status.backgroundColor,
      font: status.font,
      caption: status.caption,
      duration: status.duration,
      createdAt: status.createdAt,
      expiresAt: status.expiresAt,
      viewers: status.viewers,
      viewCount: status.viewCount,
      muted: status.muted || false,
    });
  }
  return result;
}

// ── POST /api/status ───────────────────────────────────────────────────────────
export const createStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { mediaUrl, mediaType, type, textContent, backgroundColor, font, caption, duration, muted } = req.body;

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

    const user = await User.findById(userId);
    const privacy = user?.statusPrivacy || { mode: "contacts", exceptList: [], onlyList: [] };
    let audience = "contacts";
    let audienceList = [];
    if (privacy.mode === "exceptContacts") { audience = "exceptContacts"; audienceList = privacy.exceptList || []; }
    else if (privacy.mode === "onlyContacts") { audience = "onlyContacts"; audienceList = privacy.onlyList || []; }

    let thumbnailUrl = null;
    if (statusType === "video") thumbnailUrl = req.body.thumbnailUrl || req.body.cover_270 || null;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const newStatus = new Status({
      userId, type: statusType, mediaUrl, thumbnailUrl, textContent,
      backgroundColor, font, caption,
      duration: duration || (statusType === "video" ? 15 : 5),
      audience, audienceList, viewCount: 0, createdAt: new Date(), expiresAt,
      muted: muted === true || muted === "true" || false,
    });
    await newStatus.save();

    // ── 1. Invalidate: only the poster's contrib key + own me key ─────────────
    await Promise.all([
      redis.del(contribKey(userId.toString())),
      redis.del(meKey(userId.toString())),
    ]);

    // ── 2. Respond immediately ─────────────────────────────────────────────────
    res.status(201).json({ status: true, data: newStatus });

    // ── 3. Broadcast over sockets (after invalidation) ────────────────────────
    if (req.io) {
      try {
        const friendIds = await getMutualFriendIds(userId);
        const userDoc = await User.findById(userId).select("_id username avatar");
        const payload = {
          statusId: newStatus._id.toString(),
          userId: userId.toString(),
          username: userDoc?.username || "",
          avatar: userDoc?.avatar || "",
          moment: {
            _id: newStatus._id.toString(),
            url: newStatus.mediaUrl || null,
            type: newStatus.type,
            mediaType: newStatus.type,
            textContent: newStatus.textContent || null,
            backgroundColor: newStatus.backgroundColor || null,
            font: newStatus.font || null,
            caption: newStatus.caption || null,
            duration: newStatus.duration,
            thumbnailUrl: newStatus.thumbnailUrl || null,
            createdAt: newStatus.createdAt,
            expiresAt: newStatus.expiresAt,
            viewers: [],
            viewCount: 0,
            muted: newStatus.muted,
          },
        };
        for (const friendId of friendIds) req.io.to(friendId.toString()).emit("status:new", payload);
        req.io.to(userId.toString()).emit("status:new", payload);
      } catch (broadcastErr) {
        console.error("[CreateStatus] broadcast error:", broadcastErr);
      }
    }
  } catch (err) {
    console.error("[CreateStatus]", err);
    res.status(500).json({ status: false, message: "Failed to create status" });
  }
};

// ── GET /api/status/feed ───────────────────────────────────────────────────────
export const getStatusFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const viewerIdStr = userId.toString();

    const friendIds = await getMutualFriendIds(userId);
    if (!friendIds.length) {
      return res.json({ status: true, moments: {} });
    }

    // ── Pipelined MGET: one round-trip to Redis for all friend contrib keys ────
    const keys = friendIds.map((fid) => contribKey(fid.toString()));
    const cachedValues = await redis.mget(keys);

    const momentsMap = {};
    const missingIds = [];

    friendIds.forEach((fid, i) => {
      if (cachedValues[i]) {
        const parsed = JSON.parse(cachedValues[i]);
        if (parsed && parsed.user && parsed.moments) {
          momentsMap[fid.toString()] = parsed;
        }
      } else {
        missingIds.push(fid);
      }
    });

    // ── Fetch misses from Mongo, then cache them individually ─────────────────
    if (missingIds.length) {
      const fresh = await queryStatusMomentsForUsers(missingIds, viewerIdStr);
      const pipeline = redis.pipeline();
      for (const fid of missingIds) {
        const fidStr = fid.toString();
        const data = fresh[fidStr] || null;
        if (data) {
          momentsMap[fidStr] = data;
          pipeline.setex(contribKey(fidStr), STATUS_CACHE_TTL, JSON.stringify(data));
        }
      }
      await pipeline.exec();
    }

    res.json({ status: true, moments: momentsMap });
  } catch (err) {
    console.error("[GetStatusFeed]", err);
    res.status(500).json({ status: false, message: "Failed to fetch status feed" });
  }
};

// ── GET /api/status/me ─────────────────────────────────────────────────────────
export const getMyStatuses = async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = meKey(userId.toString());

    // ── Try cache first ────────────────────────────────────────────────────────
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    // ── Cache miss — query Mongo ───────────────────────────────────────────────
    const now = new Date();
    const myActiveStatuses = await Status.find({
      userId,
      expiresAt: { $gt: now },
    }).sort({ createdAt: 1 }).populate("viewers.userId", "username avatar");

    const formatted = myActiveStatuses.map((status) => ({
      _id: status._id.toString(),
      mediaUrl: status.mediaUrl,
      mediaType: status.type,
      type: status.type,
      textContent: status.textContent,
      backgroundColor: status.backgroundColor,
      font: status.font,
      caption: status.caption,
      duration: status.duration,
      viewers: status.viewers.map((v) => ({
        userId: v.userId?._id?.toString() || v.userId?.toString(),
        username: v.userId?.username || "Someone",
        avatar:
          v.userId?.avatar && v.userId.avatar.length > 2
            ? v.userId.avatar
            : v.userId?.username
            ? v.userId.username.charAt(0).toUpperCase()
            : "S",
        viewedAt: v.viewedAt,
      })),
      viewCount: status.viewCount,
      createdAt: status.createdAt,
      expiresAt: status.expiresAt,
      muted: status.muted || false,
    }));

    const result = { status: true, data: formatted };
    await redis.setex(cacheKey, STATUS_CACHE_TTL, JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error("[GetMyStatuses]", err);
    res.status(500).json({ status: false, message: "Failed to fetch my statuses" });
  }
};

// ── POST /api/status/:id/view ─────────────────────────────────────────────────
// Incremental patch — keeps the cache warm instead of busting it
export const markStatusViewed = async (req, res) => {
  try {
    const userId = req.user._id;
    const statusId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(statusId)) {
      return res.status(400).json({ status: false, message: "Invalid status ID" });
    }

    const status = await Status.findById(statusId);
    if (!status) return res.status(404).json({ status: false, message: "Status not found" });

    const hasViewed = status.viewers.some((v) => v.userId.toString() === userId.toString());
    if (!hasViewed) {
      status.viewers.push({ userId, viewedAt: new Date() });
      status.viewCount = (status.viewCount || 0) + 1;
      await status.save();

      // ── Patch cached status:me entry for the owner — do NOT delete the key ──
      const ownerKey = meKey(status.userId.toString());
      const cached = await redis.get(ownerKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const moments = parsed.data || [];
          const moment = moments.find((m) => m._id === statusId.toString());
          if (moment) {
            if (!moment.viewers) moment.viewers = [];
            const alreadyPatched = moment.viewers.some(
              (v) => (v.userId || "").toString() === userId.toString()
            );
            if (!alreadyPatched) {
              moment.viewers.push({ userId: userId.toString(), viewedAt: new Date() });
              moment.viewCount = (moment.viewCount || 0) + 1;
              await redis.setex(ownerKey, STATUS_CACHE_TTL, JSON.stringify(parsed));
            }
          }
        } catch (patchErr) {
          // If patch fails, let the cache expire naturally — no data loss
          console.error("[MarkStatusViewed] cache patch error:", patchErr);
        }
      }
    }

    res.json({ status: true, message: "Status marked as viewed" });
  } catch (err) {
    console.error("[MarkStatusViewed]", err);
    res.status(500).json({ status: false, message: "Failed to mark status as viewed" });
  }
};

// ── DELETE /api/status/:id ────────────────────────────────────────────────────
export const deleteStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const statusId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(statusId)) {
      return res.status(400).json({ status: false, message: "Invalid status ID" });
    }

    const deleted = await Status.findOneAndDelete({ _id: statusId, userId });
    if (!deleted) {
      return res.status(404).json({ status: false, message: "Status not found or unauthorized" });
    }

    // ── 1. Invalidate: only the poster's contrib key + own me key ─────────────
    await Promise.all([
      redis.del(contribKey(userId.toString())),
      redis.del(meKey(userId.toString())),
    ]);

    // ── 2. Respond immediately ─────────────────────────────────────────────────
    res.json({ status: true, message: "Status deleted successfully" });

    // ── 3. Broadcast over sockets (after invalidation) ────────────────────────
    if (req.io) {
      try {
        const friendIds = await getMutualFriendIds(userId);
        const payload = { statusId: statusId.toString(), userId: userId.toString() };
        for (const friendId of friendIds) req.io.to(friendId.toString()).emit("status:deleted", payload);
        req.io.to(userId.toString()).emit("status:deleted", payload);
      } catch (broadcastErr) {
        console.error("[DeleteStatus] broadcast error:", broadcastErr);
      }
    }
  } catch (err) {
    console.error("[DeleteStatus]", err);
    res.status(500).json({ status: false, message: "Failed to delete status" });
  }
};
