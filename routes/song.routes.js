import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import Song from "../models/song.model.js";

const router = express.Router();

// GET /api/songs/search?q=
router.get("/api/songs/search", protect, async (req, res) => {
  try {
    const query = (req.query.q || "").trim();

    // Only search from the downloaded songs stored in our local Song database
    const dbQuery = query
      ? {
          $or: [
            { title: new RegExp(query, "i") },
            { channelTitle: new RegExp(query, "i") }
          ]
        }
      : {};

    const dbSongs = await Song.find(dbQuery).sort({ createdAt: -1 }).limit(30);

    const results = dbSongs.map(song => ({
      videoId: song.videoId,
      title: song.title,
      channelTitle: song.channelTitle,
      thumbnailUrl: song.thumbnailUrl,
      audioUrl: song.audioUrl // Direct R2 stream link
    }));

    return res.json({ status: true, data: results });
  } catch (err) {
    console.error("[Song API] Local search failure:", err);
    return res.status(500).json({ status: false, message: "Failed to search local song database" });
  }
});

export default router;
