import cron from "node-cron";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getMetadata, downloadAudioStream } from "../utils/ytDownloader.js";
import Song from "../models/song.model.js";
import { encryptBuffer } from "../utils/mediaEncryption.js";
import { youtubeApiRequest } from "../utils/youtube.js";
import { saveSongToBothDbs } from "../utils/remoteDb.js";

// Curated popular/trending fallback music videos per category if YouTube API key is missing
const FALLBACK_CATEGORIZED_VIDEOS = {
  English: [
    { videoId: "fRh_dkD3cT0", title: "Alan Walker - Faded", channelTitle: "Alan Walker", thumbnailUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=320&h=180&fit=crop" },
    { videoId: "kJQP7kiw5Fk", title: "Luis Fonsi - Despacito ft. Daddy Yankee", channelTitle: "LuisFonsiVEVO", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=320&h=180&fit=crop" },
    { videoId: "JGwWNGJdvx8", title: "Ed Sheeran - Shape of You", channelTitle: "Ed Sheeran", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=320&h=180&fit=crop" },
    { videoId: "OPf0YbXqDm0", title: "Mark Ronson - Uptown Funk ft. Bruno Mars", channelTitle: "MarkRonsonVEVO", thumbnailUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=320&h=180&fit=crop" },
    { videoId: "V1Pl8CzNzCw", title: "Billie Eilish - Bad Guy", channelTitle: "BillieEilishVEVO", thumbnailUrl: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=320&h=180&fit=crop" }
  ],
  Hindi: [
    { videoId: "Umqb9hx0OBc", title: "Arijit Singh - Tum Hi Ho", channelTitle: "T-Series", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=320&h=180&fit=crop" },
    { videoId: "hXnS5K5mScc", title: "Arijit Singh - Channa Mereya", channelTitle: "T-Series", thumbnailUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=320&h=180&fit=crop" },
    { videoId: "V7LwfY5U5WI", title: "Tera Ban Jaunga", channelTitle: "T-Series", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=320&h=180&fit=crop" },
    { videoId: "Y8Z2X-XoZsw", title: "Kabir Singh - Tujhe Kitna Chahne Aur", channelTitle: "T-Series", thumbnailUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=320&h=180&fit=crop" },
    { videoId: "GLGuLXKT9BY", title: "Diljit Dosanjh - G.O.A.T.", channelTitle: "Diljit Dosanjh", thumbnailUrl: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=320&h=180&fit=crop" }
  ],
  Punjabi: [
    { videoId: "cl0a3i2wFcc", title: "Sidhu Moose Wala - 295", channelTitle: "Sidhu Moose Wala", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=320&h=180&fit=crop" },
    { videoId: "A3ytNeHkX9s", title: "Sidhu Moose Wala - The Last Ride", channelTitle: "Sidhu Moose Wala", thumbnailUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=320&h=180&fit=crop" },
    { videoId: "vK5e0d49M9k", title: "AP Dhillon - Brown Munde", channelTitle: "Run-Up Records", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=320&h=180&fit=crop" },
    { videoId: "d7yvdusE6yM", title: "Sidhu Moose Wala - So High", channelTitle: "Sidhu Moose Wala", thumbnailUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=320&h=180&fit=crop" },
    { videoId: "0M381iO9J8Q", title: "Diljit Dosanjh - Lover", channelTitle: "Diljit Dosanjh", thumbnailUrl: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=320&h=180&fit=crop" }
  ],
  Haryanvi: [
    { videoId: "5oJle09Z5bQ", title: "Diler Kharkiya - Moto", channelTitle: "Diler Kharkiya", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=320&h=180&fit=crop" },
    { videoId: "1pM1N4XpQhI", title: "Sumit Goswami - Feelings", channelTitle: "Sumit Goswami", thumbnailUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=320&h=180&fit=crop" },
    { videoId: "4S1lXW6h7tA", title: "Gulzaar Chhaniwala - Filter Shot", channelTitle: "Gulzaar Chhaniwala", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=320&h=180&fit=crop" },
    { videoId: "tZp9x18vU4k", title: "Sumit Goswami - Parindey", channelTitle: "Sumit Goswami", thumbnailUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=320&h=180&fit=crop" },
    { videoId: "6YV6N3C4n8w", title: "MD Desi Rockstar - Haryanvi Mashup", channelTitle: "MD Desi Rockstar", thumbnailUrl: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=320&h=180&fit=crop" }
  ]
};

const CATEGORIES = ["English", "Hindi", "Punjabi", "Haryanvi"];

/**
 * Main function to fetch trending videos for English, Hindi, Punjabi, Haryanvi categories,
 * download their audio, upload to R2, and save to DB.
 */
export async function runTrendingSongsJob() {
  console.log("[TrendingSongsJob] Starting execution...");
  
  const hasKeys = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY_2 || process.env.YOUTUBE_API_KEY_1;
  let trendingList = [];

  // 1. Fetch trending music videos per category
  for (const category of CATEGORIES) {
    let categorySongs = [];
    if (hasKeys) {
      try {
        console.log(`[TrendingSongsJob] Querying YouTube Data API (with rotation) for ${category} trending songs...`);
        const data = await youtubeApiRequest(
          "search",
          {
            part: "snippet",
            maxResults: "15",
            type: "video",
            videoCategoryId: "10",
            q: `${category} trending song -shorts`
          },
          ["YOUTUBE_API_KEY", "YOUTUBE_API_KEY_2", "YOUTUBE_API_KEY_1"]
        );

        categorySongs = (data.items || []).map(item => ({
          videoId: item.id.videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnailUrl: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || ""
        }));
      } catch (apiErr) {
        console.error(`[TrendingSongsJob] Error querying YouTube API for ${category}, falling back:`, apiErr);
        categorySongs = FALLBACK_CATEGORIZED_VIDEOS[category];
      }
    } else {
      console.log(`[TrendingSongsJob] No YouTube API keys set. Using fallback list for ${category}...`);
      categorySongs = FALLBACK_CATEGORIZED_VIDEOS[category];
    }

    // Append to total candidates
    trendingList = [...trendingList, ...categorySongs];
  }

  // Deduplicate candidates based on videoId
  const uniqueSongs = [];
  const seenIds = new Set();
  for (const song of trendingList) {
    if (song.videoId && !seenIds.has(song.videoId)) {
      seenIds.add(song.videoId);
      uniqueSongs.push(song);
    }
  }

  console.log(`[TrendingSongsJob] Collected ${uniqueSongs.length} unique songs across all categories to download.`);

  // 2. Process each video
  for (const songInfo of uniqueSongs) {
    const { videoId } = songInfo;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    try {
      // Check if song already exists in the database
      const existing = await Song.findOne({ videoId });
      if (existing) {
        console.log(`[TrendingSongsJob] Song already in database: ${songInfo.title} (${videoId}). Skipping.`);
        continue;
      }

      console.log(`[TrendingSongsJob] Processing new song: ${songInfo.title} (${videoId})`);
      
      // Fetch metadata to verify and get accurate duration
      const meta = await getMetadata(videoUrl).catch(err => {
        console.warn(`[TrendingSongsJob] Failed to get metadata for ${videoId}: ${err.message}. Using default snippet details.`);
        return {
          title: songInfo.title,
          uploader: songInfo.channelTitle,
          thumbnail: songInfo.thumbnailUrl,
          duration: 0,
          formattedDuration: "0:00"
        };
      });

      // Temporary local download path
      const tempFilename = `temp_${videoId}.mp3`;
      const tempPath = path.join(os.tmpdir(), tempFilename);
      
      // Download audio stream and transcode to MP3 locally
      await downloadAudioStream(videoUrl, tempPath);
      console.log(`[TrendingSongsJob] Local download success: ${tempPath}`);

      let audioUrl = "";
      const useSongR2 = !!(process.env.SONG_R2_ACCESS_KEY_ID && process.env.SONG_R2_SECRET_ACCESS_KEY && process.env.SONG_R2_BUCKET);
      const songEndpoint = useSongR2 ? process.env.SONG_R2_ENDPOINT : process.env.R2_ENDPOINT;
      const songAccessKeyId = useSongR2 ? process.env.SONG_R2_ACCESS_KEY_ID : process.env.R2_ACCESS_KEY_ID;
      const songSecretAccessKey = useSongR2 ? process.env.SONG_R2_SECRET_ACCESS_KEY : process.env.R2_SECRET_ACCESS_KEY;
      const songBucket = useSongR2 ? process.env.SONG_R2_BUCKET : process.env.R2_BUCKET;
      
      // Check if Cloudflare R2 is configured
      if (songEndpoint && songAccessKeyId && songBucket) {
        console.log(`[TrendingSongsJob] R2 detected (${songBucket}). Encrypting and uploading to storage...`);
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
        console.log(`[TrendingSongsJob] Uploaded to R2: ${audioUrl}`);

        // Delete temporary file
        await fs.remove(tempPath);
      } else {
        console.log(`[TrendingSongsJob] R2 credentials missing. Saving song file to public downloads directory...`);
        // Local fallback: save to public downloads folder
        const localDestDir = path.join(process.cwd(), "public", "downloads");
        await fs.ensureDir(localDestDir);
        
        const localPath = path.join(localDestDir, `${videoId}.mp3`);
        await fs.move(tempPath, localPath, { overwrite: true });
        
        audioUrl = `/downloads/${videoId}.mp3`;
        console.log(`[TrendingSongsJob] Saved locally: ${audioUrl}`);
      }

      // Save song details to database
      const newSong = new Song({
        videoId,
        title: meta.title,
        channelTitle: meta.uploader,
        thumbnailUrl: meta.thumbnail,
        audioUrl,
        duration: meta.duration
      });

      await newSong.save();
      console.log(`[TrendingSongsJob] Successfully registered song in database: ${meta.title}`);

      // Replicate to remote MongoDB DB
      await saveSongToBothDbs(newSong);

    } catch (err) {
      console.error(`[TrendingSongsJob] Error downloading/uploading song (${videoId}):`, err.message);
    }
  }

  console.log("[TrendingSongsJob] Job execution finished.");
}

/**
 * Initializes and schedules the background job.
 */
export function startTrendingSongsJob() {
  console.log("[TrendingSongsJob] Starting background job scheduler...");

  // Run immediately once on server boot (asynchronous)
  runTrendingSongsJob().catch(err => {
    console.error("[TrendingSongsJob] Boot execution failed:", err);
  });

  // Schedule to run every 4 hours: "0 */4 * * *"
  cron.schedule("0 */4 * * *", async () => {
    try {
      console.log("[TrendingSongsJob] Triggering scheduled execution (4-hourly)...");
      await runTrendingSongsJob();
    } catch (err) {
      console.error("[TrendingSongsJob] Scheduled execution failed:", err);
    }
  });
}
