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
    const { limit = 10, before } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ status: false, message: "Invalid userId" });
    }

    const connected = await areConnected(myId, userId);
    if (!connected) {
      return res.status(403).json({ status: false, message: "Not connected" });
    }

    const query = {
      $or: [
        { from: myId, to: userId },
        { from: userId, to: myId },
      ],
      type: { $in: ["image", "video", "gif"] }
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const media = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .select("tempId type content cover thumb caption fileName fileSize createdAt from");

    res.json({ status: true, count: media.length, data: media });

  } catch (err) {
    console.error("[GetMedia]", err);
    res.status(500).json({ status: false, message: "Failed to fetch media" });
  }
};


/* ═══════════════════════════════════════════════════════════
   GIFS SEARCH & TRENDING PROXIES WITH BEAUTIFUL CURATED FALLBACK
   ═══════════════════════════════════════════════════════════ */
const FALLBACK_GIFS = [
  {
    url: "https://media.giphy.com/media/3o7abKhOpu0NXS3wy4/giphy.gif",
    tags: ["laugh", "funny", "lol", "haha", "smile"]
  },
  {
    url: "https://media.giphy.com/media/l0ExdHfRKRUsY4V7q/giphy.gif",
    tags: ["clap", "applaud", "nice", "congrats", "bravo"]
  },
  {
    url: "https://media.giphy.com/media/26n61r3hySP2WyU0M/giphy.gif",
    tags: ["happy", "dance", "joy", "excited", "yes"]
  },
  {
    url: "https://media.giphy.com/media/d2YWTOsVtuPa/giphy.gif",
    tags: ["sad", "cry", "tears", "upset", "no"]
  },
  {
    url: "https://media.giphy.com/media/12RfP2odT4hEOI/giphy.gif",
    tags: ["wow", "shocked", "omg", "surprise", "amazing"]
  },
  {
    url: "https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif",
    tags: ["cat", "cute", "shocked", "funny"]
  },
  {
    url: "https://media.giphy.com/media/3o85xoi6xg1ip8P9F6/giphy.gif",
    tags: ["thumbs up", "ok", "agree", "yes", "cool"]
  },
  {
    url: "https://media.giphy.com/media/l41Yc06s33GjjCo1y/giphy.gif",
    tags: ["confused", "what", "huh", "thinking", "shrug"]
  },
  {
    url: "https://media.giphy.com/media/26xBwdIuRJiAIqxz2/giphy.gif",
    tags: ["mind blown", "shocked", "wow", "magic", "science"]
  },
  {
    url: "https://media.giphy.com/media/xT0xezQGU5xCDJu316/giphy.gif",
    tags: ["party", "dance", "celebrate", "birthday", "fun"]
  },
  {
    url: "https://media.giphy.com/media/3o7TKEXa5g2H67DZZC/giphy.gif",
    tags: ["hello", "hi", "wave", "welcome", "bye"]
  },
  {
    url: "https://media.giphy.com/media/l3q2K1M6yLf4zV69y/giphy.gif",
    tags: ["wink", "flirt", "cool", "smile"]
  },
  {
    url: "https://media.giphy.com/media/3ov9jE4TPIpLI2k69q/giphy.gif",
    tags: ["love", "heart", "kiss", "cute", "hug"]
  },
  {
    url: "https://media.giphy.com/media/l4FGpPki5v270jnJC/giphy.gif",
    tags: ["angry", "mad", "rage", "frustrated", "no"]
  },
  {
    url: "https://media.giphy.com/media/xThuW4FUtQHwgvJPEI/giphy.gif",
    tags: ["tired", "sleepy", "yawn", "exhausted", "bored"]
  },
  {
    url: "https://media.giphy.com/media/l0Ex3vQt5F17vsuGs/giphy.gif",
    tags: ["scared", "fear", "ghost", "scream", "spooky"]
  }
];

export const getTrendingGifs = async (req, res) => {
  try {
    const apiKey = process.env.GIPHY_API_KEY;
    if (apiKey) {
      const response = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=24&rating=g`);
      if (response.ok) {
        const json = await response.json();
        return res.json(json);
      } else {
        const errJson = await response.json().catch(() => ({}));
        console.warn("[Giphy API Warning] Trending request failed:", errJson);
      }
    }
  } catch (err) {
    console.error("[getTrendingGifs] error fetching Giphy:", err);
  }

  // Fallback if no apiKey is set, or if it failed/banned
  const fallbackData = FALLBACK_GIFS.map(g => ({
    images: {
      fixed_height: { url: g.url },
      fixed_height_downsampled: { url: g.url }
    }
  }));
  res.json({ data: fallbackData });
};

export const searchGifs = async (req, res) => {
  try {
    const { q } = req.query;
    const apiKey = process.env.GIPHY_API_KEY;
    if (apiKey && q) {
      const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=24&rating=g`);
      if (response.ok) {
        const json = await response.json();
        return res.json(json);
      } else {
        const errJson = await response.json().catch(() => ({}));
        console.warn("[Giphy API Warning] Search request failed:", errJson);
      }
    }
  } catch (err) {
    console.error("[searchGifs] error fetching Giphy:", err);
  }

  // Fallback search
  const { q } = req.query;
  const searchStr = (q || "").toLowerCase().trim();
  let filtered = FALLBACK_GIFS;
  if (searchStr) {
    filtered = FALLBACK_GIFS.filter(g =>
      g.tags.some(tag => tag.includes(searchStr))
    );
  }
  const fallbackData = filtered.map(g => ({
    images: {
      fixed_height: { url: g.url },
      fixed_height_downsampled: { url: g.url }
    }
  }));
  res.json({ data: fallbackData });
};
