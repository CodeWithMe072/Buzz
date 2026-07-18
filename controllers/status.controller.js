import mongoose from "mongoose";
import Status from "../models/status.model.js";
import { User } from "../models/user.model.js";
import { Connection } from "../models/connection.model.js";
import { redis } from "../lib/redis.js";
import fs from "fs-extra";
import path from "path";
import os from "os";
import crypto from "crypto";
import { execFile } from "child_process";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { encryptBuffer, createDecryptStream } from "../utils/mediaEncryption.js";

// Initialize S3 client for status controller video merging
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET;

// Song R2 configuration with fallback to default R2
const useSongR2 = !!(process.env.SONG_R2_ACCESS_KEY_ID && process.env.SONG_R2_SECRET_ACCESS_KEY && process.env.SONG_R2_BUCKET);
const songS3 = useSongR2 ? new S3Client({
  region: "auto",
  endpoint: process.env.SONG_R2_ENDPOINT || process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.SONG_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.SONG_R2_SECRET_ACCESS_KEY,
  },
}) : s3;
const SONG_BUCKET = useSongR2 ? process.env.SONG_R2_BUCKET : BUCKET;

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
      songMergeFailed: status.songMergeFailed || false,
      songRef: status.songRef || null,
    });
  }
  return result;
}

// Helper to extract key from media URL
function extractKeyFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url, "http://localhost");
    return parsed.searchParams.get("key");
  } catch {
    return null;
  }
}

// Helper to download and decrypt a file from R2 to local disk
async function downloadAndDecryptR2(key, outputPath) {
  const isSongKey = key.startsWith("songs/");
  const activeS3 = isSongKey ? songS3 : s3;
  const activeBucket = isSongKey ? SONG_BUCKET : BUCKET;

  const response = await activeS3.send(
    new GetObjectCommand({
      Bucket: activeBucket,
      Key: key,
    })
  );

  return new Promise((resolve, reject) => {
    const decryptStream = createDecryptStream("v1");
    const writeStream = fs.createWriteStream(outputPath);
    
    response.Body.pipe(decryptStream).pipe(writeStream);
    
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    decryptStream.on("error", reject);
  });
}

// Helper to run FFmpeg merge
function createVideoFromImageAndAudio(imagePath, audioPath, startTime, outputPath) {
  return new Promise((resolve, reject) => {
    let resolvedOrRejected = false;
    const imgPathFixed = imagePath.replace(/\\/g, "/");
    const audPathFixed = audioPath.replace(/\\/g, "/");
    const outPathFixed = outputPath.replace(/\\/g, "/");

    const child = execFile(
      "ffmpeg",
      [
        "-y",
        "-loop", "1",
        "-i", imgPathFixed,
        "-ss", String(startTime || 0),
        "-i", audPathFixed,
        "-t", "15",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-preset", "superfast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        outPathFixed,
      ],
      (err, stdout, stderr) => {
        clearTimeout(timer);
        if (resolvedOrRejected) return;
        resolvedOrRejected = true;
        if (err) {
          console.error("[FFmpeg merge] failed:", err, stderr);
          return reject(err);
        }
        resolve();
      }
    );

    const timer = setTimeout(() => {
      if (resolvedOrRejected) return;
      resolvedOrRejected = true;
      console.error("[FFmpeg merge] TIMEOUT: FFmpeg process hung after 25 seconds. Killing it...");
      child.kill("SIGKILL");
      reject(new Error("FFmpeg merging process timed out after 25 seconds."));
    }, 25000);
  });
}

// Helper to merge audio into video status, muting original video audio
function mergeAudioIntoVideo(videoPath, audioPath, startTime, outputPath) {
  return new Promise((resolve, reject) => {
    let resolvedOrRejected = false;
    const vidPathFixed = videoPath.replace(/\\/g, "/");
    const audPathFixed = audioPath.replace(/\\/g, "/");
    const outPathFixed = outputPath.replace(/\\/g, "/");

    const child = execFile(
      "ffmpeg",
      [
        "-y",
        "-i", vidPathFixed,
        "-ss", String(startTime || 0),
        "-stream_loop", "-1",
        "-i", audPathFixed,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        outPathFixed,
      ],
      (err, stdout, stderr) => {
        clearTimeout(timer);
        if (resolvedOrRejected) return;
        resolvedOrRejected = true;
        if (err) {
          console.error("[FFmpeg video audio merge] failed:", err, stderr);
          return reject(err);
        }
        resolve();
      }
    );

    const timer = setTimeout(() => {
      if (resolvedOrRejected) return;
      resolvedOrRejected = true;
      console.error("[FFmpeg video audio merge] TIMEOUT: FFmpeg process hung after 25 seconds. Killing it...");
      child.kill("SIGKILL");
      reject(new Error("FFmpeg video audio merging process timed out after 25 seconds."));
    }, 25000);
  });
}

// ── POST /api/status ───────────────────────────────────────────────────────────
export const createStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { mediaUrl, mediaType, type, textContent, backgroundColor, font, caption, duration, muted, songRef } = req.body;

    let statusType = type || mediaType;
    if (!statusType || !["image", "video", "text"].includes(statusType)) {
      return res.status(400).json({ status: false, message: "Invalid status type" });
    }
    if (statusType === "text" && !textContent) {
      return res.status(400).json({ status: false, message: "textContent is required for text status" });
    }
    if (statusType !== "text" && !mediaUrl) {
      return res.status(400).json({ status: false, message: "mediaUrl is required for media status" });
    }

    let finalMediaUrl = mediaUrl;
    let finalType = statusType;
    let finalDuration = duration || (statusType === "video" ? 15 : 5);

    // Normalize songRef at ingress once
    let normalizedSongRef = null;
    if (songRef) {
      normalizedSongRef = {
        youtubeVideoId: songRef.videoId || songRef.youtubeVideoId || null,
        title: songRef.title || null,
        channelTitle: songRef.channelTitle || null,
        thumbnailUrl: songRef.thumbnailUrl || null,
        audioUrl: songRef.audioUrl || null,
        startTime: Number(songRef.startTime || 0)
      };
    }

    let songMergeFailed = false;

    // Merge static image + 15s trimmed audio on the server side
    if (statusType === "image" && normalizedSongRef && normalizedSongRef.audioUrl) {
      console.log("[Status Controller] Music detected on image status. Attempting backend video generation...");
      const tempImage = path.join(os.tmpdir(), `img_${crypto.randomUUID()}.jpg`);
      const tempAudio = path.join(os.tmpdir(), `aud_${crypto.randomUUID()}.mp3`);
      const tempOutput = path.join(os.tmpdir(), `vid_${crypto.randomUUID()}.mp4`);
      
      try {
        // 1. Download and decrypt the image
        const imageKey = extractKeyFromUrl(mediaUrl);
        if (!imageKey) {
          throw new Error("Invalid image key in mediaUrl");
        }
        await downloadAndDecryptR2(imageKey, tempImage);
        console.log("[Status Controller] Image downloaded and decrypted successfully.");

        // 2. Locate or download the audio
        const audioKey = extractKeyFromUrl(normalizedSongRef.audioUrl);
        if (audioKey) {
          await downloadAndDecryptR2(audioKey, tempAudio);
          console.log("[Status Controller] Audio downloaded and decrypted successfully.");
        } else {
          const localPath = path.join(process.cwd(), "public", normalizedSongRef.audioUrl);
          if (await fs.pathExists(localPath)) {
            await fs.copy(localPath, tempAudio);
            console.log("[Status Controller] Using local audio file.");
          } else {
            throw new Error(`Audio file not found locally: ${localPath}`);
          }
        }

        // 3. Merge into MP4 video using FFmpeg
        const startTime = normalizedSongRef.startTime || 0;
        await createVideoFromImageAndAudio(tempImage, tempAudio, startTime, tempOutput);
        console.log("[Status Controller] FFmpeg video merging SUCCESS.");

        // 4. Encrypt and upload the generated video to R2
        const videoBuffer = await fs.readFile(tempOutput);
        const encryptedVideo = encryptBuffer(videoBuffer, "v1");
        const newVideoKey = `chat_media/status_video_${crypto.randomUUID()}.mp4`;
        
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: newVideoKey,
            Body: encryptedVideo,
            ContentType: "video/mp4",
            CacheControl: "public, max-age=31536000",
          })
        );
        
        // 5. Update status properties to make it a video status
        finalMediaUrl = `/api/media?key=${encodeURIComponent(newVideoKey)}&v=v1`;
        finalType = "video";
        finalDuration = 15;
        console.log("[Status Controller] Generated video uploaded successfully:", finalMediaUrl);
        
      } catch (mergeErr) {
        console.error("[Status Controller] Backend video generation failed. Setting songMergeFailed flag and falling back to static image:", mergeErr);
        songMergeFailed = true;
        // Keep finalType as "image" and finalMediaUrl as the original static image URL
        finalType = "image";
        finalMediaUrl = mediaUrl;
        finalDuration = duration || 5;
      } finally {
        // Cleanup temp files
        await fs.remove(tempImage).catch(() => {});
        await fs.remove(tempAudio).catch(() => {});
        await fs.remove(tempOutput).catch(() => {});
      }
    } else if (statusType === "video" && normalizedSongRef && normalizedSongRef.audioUrl) {
      console.log("[Status Controller] Music detected on video status. Attempting backend audio merge...");
      const tempVideo = path.join(os.tmpdir(), `vid_in_${crypto.randomUUID()}.mp4`);
      const tempAudio = path.join(os.tmpdir(), `aud_${crypto.randomUUID()}.mp3`);
      const tempOutput = path.join(os.tmpdir(), `vid_out_${crypto.randomUUID()}.mp4`);
      
      try {
        // 1. Download and decrypt the video
        const videoKey = extractKeyFromUrl(mediaUrl);
        if (!videoKey) {
          throw new Error("Invalid video key in mediaUrl");
        }
        await downloadAndDecryptR2(videoKey, tempVideo);
        console.log("[Status Controller] Video downloaded and decrypted successfully.");

        // 2. Locate or download the audio
        const audioKey = extractKeyFromUrl(normalizedSongRef.audioUrl);
        if (audioKey) {
          await downloadAndDecryptR2(audioKey, tempAudio);
          console.log("[Status Controller] Audio downloaded and decrypted successfully.");
        } else {
          const localPath = path.join(process.cwd(), "public", normalizedSongRef.audioUrl);
          if (await fs.pathExists(localPath)) {
            await fs.copy(localPath, tempAudio);
            console.log("[Status Controller] Using local audio file.");
          } else {
            throw new Error(`Audio file not found locally: ${localPath}`);
          }
        }

        // 3. Merge audio into video status using FFmpeg
        const startTime = normalizedSongRef.startTime || 0;
        await mergeAudioIntoVideo(tempVideo, tempAudio, startTime, tempOutput);
        console.log("[Status Controller] FFmpeg video audio merging SUCCESS.");

        // 4. Encrypt and upload the generated video to R2
        const videoBuffer = await fs.readFile(tempOutput);
        const encryptedVideo = encryptBuffer(videoBuffer, "v1");
        const newVideoKey = `chat_media/status_video_${crypto.randomUUID()}.mp4`;
        
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: newVideoKey,
            Body: encryptedVideo,
            ContentType: "video/mp4",
            CacheControl: "public, max-age=31536000",
          })
        );
        
        // 5. Update status properties
        finalMediaUrl = `/api/media?key=${encodeURIComponent(newVideoKey)}&v=v1`;
        finalType = "video";
        finalDuration = duration || 15;
        console.log("[Status Controller] Generated video uploaded successfully:", finalMediaUrl);
        
      } catch (mergeErr) {
        console.error("[Status Controller] Backend video merging failed. Setting songMergeFailed flag and falling back to original video:", mergeErr);
        songMergeFailed = true;
        // Keep finalType as "video" and finalMediaUrl as the original video URL
        finalType = "video";
        finalMediaUrl = mediaUrl;
        finalDuration = duration || 15;
      } finally {
        // Cleanup temp files
        await fs.remove(tempVideo).catch(() => {});
        await fs.remove(tempAudio).catch(() => {});
        await fs.remove(tempOutput).catch(() => {});
      }
    }

    const user = await User.findById(userId);
    const privacy = user?.statusPrivacy || { mode: "contacts", exceptList: [], onlyList: [] };
    let audience = "contacts";
    let audienceList = [];
    if (privacy.mode === "exceptContacts") { audience = "exceptContacts"; audienceList = privacy.exceptList || []; }
    else if (privacy.mode === "onlyContacts") { audience = "onlyContacts"; audienceList = privacy.onlyList || []; }

    let thumbnailUrl = null;
    if (finalType === "video") {
      thumbnailUrl = req.body.thumbnailUrl || req.body.cover_270 || mediaUrl || null;
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const newStatus = new Status({
      userId,
      type: finalType,
      mediaUrl: finalMediaUrl,
      thumbnailUrl,
      textContent,
      backgroundColor,
      font,
      caption,
      duration: finalDuration,
      audience,
      audienceList,
      viewCount: 0,
      createdAt: new Date(),
      expiresAt,
      muted: muted === true || muted === "true" || false,
      songMergeFailed,
      songRef: normalizedSongRef || null,
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
            songMergeFailed: newStatus.songMergeFailed,
            songRef: newStatus.songRef || null,
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

// ── POST /api/status/:id/extend ───────────────────────────────────────────────
export const extendStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const statusId = req.params.id;
    const { amount, unit } = req.body;

    if (!mongoose.Types.ObjectId.isValid(statusId)) {
      return res.status(400).json({ status: false, message: "Invalid status ID" });
    }

    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ status: false, message: "Invalid extension amount. Must be a positive integer." });
    }

    if (!["minutes", "hours", "days"].includes(unit)) {
      return res.status(400).json({ status: false, message: "Invalid extension unit. Must be minutes, hours, or days." });
    }

    const status = await Status.findById(statusId);
    if (!status) {
      return res.status(404).json({ status: false, message: "Status not found" });
    }

    if (status.userId.toString() !== userId.toString()) {
      return res.status(403).json({ status: false, message: "Unauthorized to extend this status" });
    }

    let additionMs = 0;
    if (unit === "minutes") {
      additionMs = parsedAmount * 60 * 1000;
    } else if (unit === "hours") {
      additionMs = parsedAmount * 60 * 60 * 1000;
    } else if (unit === "days") {
      additionMs = parsedAmount * 24 * 60 * 60 * 1000;
    }

    // Extend relative to base expiration time (createdAt + 24 hours)
    const baseExpiresAtTime = status.createdAt.getTime() + 24 * 60 * 60 * 1000;
    const newExpiresAt = new Date(baseExpiresAtTime + additionMs);

    status.expiresAt = newExpiresAt;
    await status.save();

    // ── 1. Invalidate: only the poster's contrib key + own me key ─────────────
    await Promise.all([
      redis.del(contribKey(userId.toString())),
      redis.del(meKey(userId.toString())),
    ]);

    // ── 2. Respond ─────────────────────────────────────────────────────────────
    res.json({ 
      status: true, 
      message: `Status extended successfully by ${parsedAmount} ${unit}`, 
      newExpiresAt: newExpiresAt.toISOString() 
    });

    // ── 3. Broadcast over sockets (after invalidation) ────────────────────────
    if (req.io) {
      try {
        const friendIds = await getMutualFriendIds(userId);
        const payload = { 
          statusId: statusId.toString(), 
          userId: userId.toString(), 
          expiresAt: newExpiresAt.toISOString() 
        };
        for (const friendId of friendIds) {
          req.io.to(friendId.toString()).emit("status:extended", payload);
        }
        req.io.to(userId.toString()).emit("status:extended", payload);
      } catch (broadcastErr) {
        console.error("[ExtendStatus] broadcast error:", broadcastErr);
      }
    }
  } catch (err) {
    console.error("[ExtendStatus]", err);
    res.status(500).json({ status: false, message: "Failed to extend status" });
  }
};

