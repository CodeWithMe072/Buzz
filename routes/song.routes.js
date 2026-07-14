import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import Song from "../models/song.model.js";
import SongRequest from "../models/songRequest.model.js";
import { redis } from "../lib/redis.js";
import { songQueue } from "../lib/songQueue.js";
import { youtubeApiRequest } from "../utils/youtube.js";

const router = express.Router();

// GET /api/songs/search?q=
router.get("/api/songs/search", protect, async (req, res) => {
  try {
    const query = (req.query.q || "").trim();
    const source = req.query.source || "db"; // "db" or "youtube"
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const pageToken = req.query.pageToken || "";

    if (source === "db") {
      // 1. Paginated Local DB Search
      const skip = (page - 1) * limit;
      const dbQuery = query
        ? {
            $or: [
              { title: new RegExp(query, "i") },
              { channelTitle: new RegExp(query, "i") }
            ]
          }
        : {};

      const dbSongs = await Song.find(dbQuery).skip(skip).limit(limit);
      const dbResults = dbSongs.map(song => ({
        videoId: song.videoId,
        title: song.title,
        channelTitle: song.channelTitle,
        thumbnailUrl: song.thumbnailUrl,
        audioUrl: song.audioUrl,
        source: "db"
      }));

      return res.json({
        status: true,
        data: dbResults,
        hasMore: dbSongs.length === limit
      });
    } else {
      // 2. Paginated YouTube Search with Key Rotation
      const hasKeys = process.env.YOUTUBE_API_KEY_1 || process.env.YOUTUBE_API_KEY_2 || process.env.YOUTUBE_API_KEY;
      if (!query || !hasKeys) {
        return res.json({ status: true, data: [], nextPageToken: "" });
      }

      const cacheKey = `yt-search:${query.toLowerCase()}:${pageToken}`;
      let youtubeResults = [];
      let nextPageToken = "";

      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          youtubeResults = parsed.results || [];
          nextPageToken = parsed.nextPageToken || "";
          console.log(`[Song API] Cache hit for YouTube page search: "${query}" (token: "${pageToken}")`);
        } else {
          console.log(`[Song API] Cache miss. Querying YouTube Data API (with rotation) for: "${query}" (token: "${pageToken}")`);
          const params = {
            part: "snippet",
            maxResults: String(limit),
            type: "video",
            q: `${query} -shorts`
          };
          if (pageToken) {
            params.pageToken = pageToken;
          }

          const data = await youtubeApiRequest(
            "search",
            params,
            ["YOUTUBE_API_KEY_1", "YOUTUBE_API_KEY_2", "YOUTUBE_API_KEY"]
          );

          youtubeResults = (data.items || []).map(item => ({
            videoId: item.id?.videoId || "",
            title: item.snippet?.title || "",
            channelTitle: item.snippet?.channelTitle || "",
            thumbnailUrl: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
            source: "youtube"
          })).filter(yt => yt.videoId);

          nextPageToken = data.nextPageToken || "";

          // Cache in Redis for 15 minutes
          await redis.set(cacheKey, JSON.stringify({ results: youtubeResults, nextPageToken }), "EX", 15 * 60);
        }

        // Deduplicate and resolve against MongoDB catalog
        const ytVideoIds = youtubeResults.map(yt => yt.videoId);
        const existingSongs = await Song.find({ videoId: { $in: ytVideoIds } });
        const existingMap = {};
        existingSongs.forEach(song => {
          existingMap[song.videoId] = song;
        });

        const activeRequests = await SongRequest.find({ videoId: { $in: ytVideoIds } });
        const requestMap = {};
        activeRequests.forEach(req => {
          requestMap[req.videoId] = req.status;
        });

        const finalResults = youtubeResults.map(yt => {
          if (existingMap[yt.videoId]) {
            const dbSong = existingMap[yt.videoId];
            return {
              videoId: dbSong.videoId,
              title: dbSong.title,
              channelTitle: dbSong.channelTitle,
              thumbnailUrl: dbSong.thumbnailUrl,
              audioUrl: dbSong.audioUrl,
              source: "db"
            };
          }
          return {
            ...yt,
            requestStatus: requestMap[yt.videoId] || null
          };
        });

        return res.json({
          status: true,
          data: finalResults,
          nextPageToken
        });
      } catch (ytErr) {
        console.error("[Song API] Failed YouTube search page fallback:", ytErr);
        return res.status(500).json({ status: false, message: "Failed to fetch YouTube page results" });
      }
    }
  } catch (err) {
    console.error("[Song API] Search failure:", err);
    return res.status(500).json({ status: false, message: "Failed to search song catalog" });
  }
});

// POST /api/songs/request
router.post("/api/songs/request", protect, async (req, res) => {
  try {
    const { videoId, title, channelTitle } = req.body;
    if (!videoId || !title) {
      return res.status(400).json({ status: false, message: "videoId and title are required" });
    }

    // 1. Guard: Check if the song already exists in the catalog
    const existingSong = await Song.findOne({ videoId });
    if (existingSong) {
      return res.status(200).json({
        status: true,
        message: "This song is already available in the catalog",
        isAlreadyAvailable: true,
        data: existingSong
      });
    }

    // 2. Guard: Check if a request already exists
    let request = await SongRequest.findOne({ videoId });
    if (request) {
      if (request.status === "failed") {
        // Allow re-requesting failed attempts
        request.status = "pending";
        request.failureReason = null;
        request.requestedBy = req.user._id;
        request.requestedAt = new Date();
        await request.save();
        
        // Enqueue background job
        await songQueue.add("download", { requestId: request._id }, { attempts: 3, backoff: { type: "exponential", delay: 5000 } });
        
        return res.json({
          status: true,
          message: "Re-requested failed download request",
          data: request
        });
      }

      // Return status for pending/processing/completed
      return res.status(200).json({
        status: true,
        message: `Song request is currently in status: ${request.status}`,
        data: request
      });
    }

    // 3. Create new request
    request = new SongRequest({
      videoId,
      title,
      channelTitle,
      requestedBy: req.user._id,
      status: "pending"
    });
    await request.save();

    // 4. Enqueue background job via BullMQ
    await songQueue.add("download", { requestId: request._id }, { attempts: 3, backoff: { type: "exponential", delay: 5000 } });

    console.log(`[Song Request API] Created request ${request._id} for videoId ${videoId} and enqueued download job`);

    return res.json({ status: true, data: request });
  } catch (err) {
    console.error("[Song Request API] Request endpoint failure:", err);
    return res.status(500).json({ status: false, message: "Failed to submit song request" });
  }
});

export default router;
