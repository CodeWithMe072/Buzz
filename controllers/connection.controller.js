import mongoose from "mongoose";
import { Connection } from "../models/connection.model.js";
import { User } from "../models/user.model.js";

/* ═══════════════════════════════════════════════════════════
   SEND REQUEST
   POST /connections/send
   Body: { receiverId }
═══════════════════════════════════════════════════════════ */
export const sendRequest = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ status: false, message: "receiverId is required" });
    }

    if (senderId.toString() === receiverId) {
      return res.status(400).json({ status: false, message: "Cannot send request to yourself" });
    }

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ status: false, message: "Invalid receiverId" });
    }

    // Check receiver exists
    const receiver = await User.findById(receiverId).select("_id username avatar");
    if (!receiver) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Check if a connection already exists in either direction
    const existing = await Connection.findOne({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId },
      ],
    });

    if (existing) {
      const msgs = {
        pending: "Request already sent",
        accepted: "You are already connected",
        rejected: "Request was rejected",
        blocked: "Unable to send request",
      };
      return res.status(409).json({
        status: false,
        message: msgs[existing.status] || "Connection already exists",
        connectionStatus: existing.status,
      });
    }

    const connection = await Connection.create({
      sender: senderId,
      receiver: receiverId,
    });

    res.status(201).json({
      status: true,
      message: "Request sent",
      connection: {
        id: connection._id,
        receiver: {
          id: receiver._id,
          username: receiver.username,
          avatar: receiver.avatar,
        },
        status: connection.status,
        createdAt: connection.createdAt,
      },
    });

  } catch (err) {
    console.error("[SendRequest]", err);
    res.status(500).json({ status: false, message: "Failed to send request" });
  }
};


/* ═══════════════════════════════════════════════════════════
   RESPOND TO REQUEST
   POST /connections/respond
   Body: { connectionId, action: "accept" | "reject" }
═══════════════════════════════════════════════════════════ */
export const respondToRequest = async (req, res) => {
  try {
    const { connectionId, action } = req.body;

    if (!connectionId || !["accept", "reject"].includes(action)) {
      return res.status(400).json({
        status: false,
        message: "connectionId and action (accept|reject) are required",
      });
    }

    const connection = await Connection.findById(connectionId);

    if (!connection) {
      return res.status(404).json({ status: false, message: "Connection not found" });
    }

    // Only the receiver can accept or reject
    if (connection.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ status: false, message: "Not authorized" });
    }

    if (connection.status !== "pending") {
      return res.status(400).json({
        status: false,
        message: `Request is already ${connection.status}`,
      });
    }

    connection.status = action === "accept" ? "accepted" : "rejected";
    await connection.save();

    res.json({
      status: true,
      message: `Request ${connection.status}`,
      connectionStatus: connection.status,
    });

  } catch (err) {
    console.error("[RespondToRequest]", err);
    res.status(500).json({ status: false, message: "Failed to respond to request" });
  }
};


/* ═══════════════════════════════════════════════════════════
   LIST MY CONNECTIONS (accepted only)
   GET /connections
   Returns people I can chat with
═══════════════════════════════════════════════════════════ */
export const listConnections = async (req, res) => {
  try {
    const userId = req.user._id;

    const connections = await Connection.find({
      $or: [{ sender: userId }, { receiver: userId }],
      status: "accepted",
    })
      .populate("sender", "_id username avatar lastSeen")
      .populate("receiver", "_id username avatar lastSeen")
      .sort({ updatedAt: -1 });

    // Normalise: always return the OTHER person, not me
    const contacts = connections.map((c) => {
      const isMe = c.sender._id.toString() === userId.toString();
      const other = isMe ? c.receiver : c.sender;
      return {
        connectionId: c._id.toString(),
        user: {
          id: other._id.toString(),
          username: other.username,
          avatar: other.avatar,
          lastSeen: other.lastSeen,
        },
        since: c.updatedAt,
      };
    });

    res.json({ status: true, count: contacts.length, contacts });

  } catch (err) {
    console.error("[ListConnections]", err);
    res.status(500).json({ status: false, message: "Failed to fetch connections" });
  }
};


/* ═══════════════════════════════════════════════════════════
   PENDING REQUESTS (incoming)
   GET /connections/pending
═══════════════════════════════════════════════════════════ */
export const pendingRequests = async (req, res) => {
  try {
    const requests = await Connection.find({
      receiver: req.user._id,
      status: "pending",
    })
      .populate("sender", "_id username avatar")
      .sort({ createdAt: -1 });

    res.json({
      status: true,
      count: requests.length,
      requests: requests.map((r) => ({
        connectionId: r._id,
        from: {
          id: r.sender._id,
          username: r.sender.username,
          avatar: r.sender.avatar,
        },
        sentAt: r.createdAt,
      })),
    });

  } catch (err) {
    console.error("[PendingRequests]", err);
    res.status(500).json({ status: false, message: "Failed to fetch pending requests" });
  }
};


/* ═══════════════════════════════════════════════════════════
   SENT REQUESTS (outgoing, still pending)
   GET /connections/sent
═══════════════════════════════════════════════════════════ */
export const sentRequests = async (req, res) => {
  try {
    const requests = await Connection.find({
      sender: req.user._id,
      status: "pending",
    })
      .populate("receiver", "_id username avatar")
      .sort({ createdAt: -1 });

    res.json({
      status: true,
      count: requests.length,
      requests: requests.map((r) => ({
        connectionId: r._id,
        to: {
          id: r.receiver._id,
          username: r.receiver.username,
          avatar: r.receiver.avatar,
        },
        sentAt: r.createdAt,
      })),
    });

  } catch (err) {
    console.error("[SentRequests]", err);
    res.status(500).json({ status: false, message: "Failed to fetch sent requests" });
  }
};


/* ═══════════════════════════════════════════════════════════
   SEARCH USERS (to find people to add)
   GET /connections/search?q=username
   Returns users who are NOT already connected to you
═══════════════════════════════════════════════════════════ */
export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        status: false,
        message: "Search query must be at least 2 characters",
      });
    }

    // Get all users I already have a connection with (any status)
    const myConnections = await Connection.find({
      $or: [{ sender: req.user._id }, { receiver: req.user._id }],
    }).select("sender receiver");

    const connectedIds = new Set();
    myConnections.forEach((c) => {
      connectedIds.add(c.sender.toString());
      connectedIds.add(c.receiver.toString());
    });
    connectedIds.add(req.user._id.toString()); // exclude self

    const users = await User.find({
      _id: { $nin: [...connectedIds] },
      username: { $regex: q.trim(), $options: "i" },
      isActive: true,
    })
      .select("_id username avatar")
      .limit(20);

    res.json({ status: true, count: users.length, users });

  } catch (err) {
    console.error("[SearchUsers]", err);
    res.status(500).json({ status: false, message: "Search failed" });
  }
};


/* ═══════════════════════════════════════════════════════════
   REMOVE CONNECTION
   DELETE /connections/:connectionId
═══════════════════════════════════════════════════════════ */
export const removeConnection = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const userId = req.user._id;

    const connection = await Connection.findOne({
      _id: connectionId,
      $or: [{ sender: userId }, { receiver: userId }],
    });

    if (!connection) {
      return res.status(404).json({ status: false, message: "Connection not found" });
    }

    await connection.deleteOne();

    res.json({ status: true, message: "Connection removed" });

  } catch (err) {
    console.error("[RemoveConnection]", err);
    res.status(500).json({ status: false, message: "Failed to remove connection" });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET FRIEND MOMENTS
   GET /connections/moments/:friendId
   Protected: requires JWT
═══════════════════════════════════════════════════════════ */
export const getFriendMoments = async (req, res) => {
  try {
    const userId = req.user._id;
    const { friendId } = req.params;

    if (!friendId || !mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({ status: false, message: "Invalid or missing friendId" });
    }

    // Verify they are accepted connections
    const connection = await Connection.findOne({
      $or: [
        { sender: userId, receiver: friendId },
        { sender: friendId, receiver: userId },
      ],
      status: "accepted",
    });

    if (!connection) {
      return res.status(403).json({ status: false, message: "You are not connected with this user" });
    }

    // Fetch friend and verify whitelist settings
    const friend = await User.findById(friendId).select("randomSnapshotEnabled randomSnapshotAllowedFriends randomSnapshots");
    if (!friend) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    if (!friend.randomSnapshotEnabled) {
      return res.json({ status: true, moments: [] });
    }

    const isWhitelisted = friend.randomSnapshotAllowedFriends?.some(
      (id) => id.toString() === userId.toString()
    );

    if (!isWhitelisted) {
      return res.json({ status: true, moments: [] });
    }

    // Return friend's moments (newest first)
    const moments = (friend.randomSnapshots || []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ status: true, moments });

  } catch (err) {
    console.error("[GetFriendMoments]", err);
    res.status(500).json({ status: false, message: "Failed to fetch moments" });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET ALL FRIENDS MOMENTS
   GET /connections/moments
   Protected: requires JWT
   Returns all moments of friends who whitelisted me
═══════════════════════════════════════════════════════════ */
export const getAllFriendsMoments = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all accepted connections of the user
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

    // Query friends who have snapshots enabled and have whitelisted the current user
    const friends = await User.find({
      _id: { $in: friendIds },
      randomSnapshotEnabled: true,
      randomSnapshotAllowedFriends: userId,
    }).select("_id username avatar randomSnapshots");

    const momentsMap = {};
    friends.forEach((f) => {
      // Sort snapshots newest first
      const sortedSnaps = (f.randomSnapshots || []).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      momentsMap[f._id.toString()] = {
        user: {
          id: f._id.toString(),
          username: f.username,
          avatar: f.avatar,
        },
        moments: sortedSnaps,
      };
    });

    res.json({ status: true, moments: momentsMap });

  } catch (err) {
    console.error("[GetAllFriendsMoments]", err);
    res.status(500).json({ status: false, message: "Failed to fetch moments" });
  }
};

