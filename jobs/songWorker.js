import { Worker } from "bullmq";
import Redis from "ioredis";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getMetadata, downloadAudioStream } from "../utils/ytDownloader.js";
import Song from "../models/song.model.js";
import SongRequest from "../models/songRequest.model.js";
import { encryptBuffer } from "../utils/mediaEncryption.js";
import { redis } from "../lib/redis.js";
import { saveSongToBothDbs } from "../utils/remoteDb.js";

// Create a dedicated Redis connection for the worker with maxRetriesPerRequest: null
const workerConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const songWorker = new Worker(
  "song-download",
  async (job) => {
    const { requestId } = job.data;
    const startTime = Date.now();
    console.log(`[SongWorker] Picked up job ${job.id} for request ID: ${requestId}`);

    const request = await SongRequest.findById(requestId);
    if (!request) {
      throw new Error(`SongRequest ${requestId} not found`);
    }

    // 1. Update status to processing
    request.status = "processing";
    await request.save();

    const { videoId } = request;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const tempFilename = `temp_${videoId}_${Date.now()}.mp3`;
    const tempPath = path.join(os.tmpdir(), tempFilename);

    try {
      // 2. Fetch metadata to get uploader, title, duration, and thumbnail
      console.log(`[SongWorker] Fetching metadata for videoId: ${videoId}`);
      const meta = await getMetadata(videoUrl).catch((metaErr) => {
        console.warn(`[SongWorker] Metadata extraction failed for ${videoId}: ${metaErr.message}`);
        return {
          title: request.title,
          uploader: request.channelTitle || "Unknown Artist",
          thumbnail: "",
          duration: 0,
        };
      });

      // Reject if the video is too short or too long
      if (meta.duration > 0) {
        if (meta.duration < 90) {
          throw new Error(`Video duration is too short (${meta.duration}s). YouTube Shorts or short clips are not supported.`);
        }
        if (meta.duration > 360) {
          throw new Error(`Video duration is too long (${meta.duration}s). Songs longer than 6 minutes are not supported.`);
        }
      }

      // 3. Download audio stream and transcode to MP3 locally
      console.log(`[SongWorker] Downloading audio stream for videoId: ${videoId}`);
      await downloadAudioStream(videoUrl, tempPath);
      console.log(`[SongWorker] Download completed successfully. Temporary path: ${tempPath}`);

      let audioUrl = "";
      const useSongR2 = !!(process.env.SONG_R2_ACCESS_KEY_ID && process.env.SONG_R2_SECRET_ACCESS_KEY && process.env.SONG_R2_BUCKET);
      const songEndpoint = useSongR2 ? process.env.SONG_R2_ENDPOINT : process.env.R2_ENDPOINT;
      const songAccessKeyId = useSongR2 ? process.env.SONG_R2_ACCESS_KEY_ID : process.env.R2_ACCESS_KEY_ID;
      const songSecretAccessKey = useSongR2 ? process.env.SONG_R2_SECRET_ACCESS_KEY : process.env.R2_SECRET_ACCESS_KEY;
      const songBucket = useSongR2 ? process.env.SONG_R2_BUCKET : process.env.R2_BUCKET;

      // 4. Upload to Cloudflare R2 if configured, otherwise save locally
      if (songEndpoint && songAccessKeyId && songBucket) {
        console.log(`[SongWorker] Cloudflare R2 detected (${songBucket}). Encrypting and uploading audio stream...`);
        const fileBuffer = await fs.readFile(tempPath);
        
        // Encrypt the audio buffer to align with application-wide media encryption
        const encryptedBuffer = encryptBuffer(fileBuffer, "v1");

        const s3 = new S3Client({
          region: "auto",
          endpoint: songEndpoint,
          credentials: {
            accessKeyId: songAccessKeyId,
            secretAccessKey: songSecretAccessKey,
          },
        });

        const r2Key = `songs/${videoId}.mp3`;
        await s3.send(
          new PutObjectCommand({
            Bucket: songBucket,
            Key: r2Key,
            Body: encryptedBuffer,
            ContentType: "audio/mpeg",
            CacheControl: "public, max-age=31536000",
          })
        );

        // Get public media path with on-the-fly decryption query
        audioUrl = `/api/media?key=${encodeURIComponent(r2Key)}&v=v1`;
        console.log(`[SongWorker] Successfully uploaded to R2: ${audioUrl}`);

        // Clean up temporary local file
        await fs.remove(tempPath).catch(() => {});
      } else {
        console.log(`[SongWorker] R2 credentials missing. Saving song locally to public downloads folder...`);
        const localDestDir = path.join(process.cwd(), "public", "downloads");
        await fs.ensureDir(localDestDir);

        const localPath = path.join(localDestDir, `${videoId}.mp3`);
        await fs.move(tempPath, localPath, { overwrite: true });

        audioUrl = `/downloads/${videoId}.mp3`;
        console.log(`[SongWorker] Successfully saved locally: ${audioUrl}`);
      }

      // 5. Save the completed song in the catalog
      let song = await Song.findOne({ videoId });
      if (!song) {
        song = new Song({
          videoId,
          title: meta.title || request.title,
          channelTitle: meta.uploader || request.channelTitle,
          thumbnailUrl: meta.thumbnail || "",
          audioUrl,
          duration: meta.duration || 0,
        });
        await song.save();
        console.log(`[SongWorker] Saved new song catalog entry for: ${song.title}`);
      }

      // 5.5 Replicate metadata to remote MongoDB DB
      await saveSongToBothDbs(song);

      // 6. Update request status to completed
      request.status = "completed";
      request.completedAt = new Date();
      await request.save();

      // 7. Invalidate search cache keys in Redis
      try {
        const keys = await redis.keys("yt-search:*");
        if (keys && keys.length > 0) {
          await redis.del(keys);
          console.log(`[SongWorker] Cleared ${keys.length} cached YouTube search query keys on success`);
        }
      } catch (cacheErr) {
        console.error("[SongWorker] Failed to clear YouTube search cache:", cacheErr.message);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[SongWorker] Completed job ${job.id} for request ${requestId} in ${duration} seconds.`);
    } catch (err) {
      console.error(`[SongWorker] Processing failure on job ${job.id} for request ${requestId}:`, err.message);
      
      // Clean up temporary file if it still exists
      if (await fs.pathExists(tempPath)) {
        await fs.remove(tempPath).catch(() => {});
      }

      // Propagate the error so BullMQ tracks attempts and handles retries
      throw err;
    }
  },
  {
    connection: workerConnection,
    concurrency: 2, // Concurrency limit
  }
);

// Listen to worker failure events to mark the request state as failed when all attempts are exhausted
songWorker.on("failed", async (job, err) => {
  const { requestId } = job.data;
  console.error(`[SongWorker] Job ${job.id} has failed: ${err.message}. Attempts made: ${job.attemptsMade}`);
  
  if (job.attemptsMade >= job.opts.attempts) {
    console.log(`[SongWorker] Job ${job.id} exhausted all retry attempts. Setting request status to failed.`);
    try {
      const request = await SongRequest.findById(requestId);
      if (request) {
        request.status = "failed";
        request.failureReason = err.message || "Failed to download or transcode video";
        await request.save();
      }
    } catch (dbErr) {
      console.error("[SongWorker] Failed to write failure status to DB:", dbErr.message);
    }
  }
});

songWorker.on("error", (err) => {
  console.error("[SongWorker] Redis/Worker general error:", err.message);
});
