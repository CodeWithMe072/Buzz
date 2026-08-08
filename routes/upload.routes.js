import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import { Readable, Transform } from "stream";
import fse from "fs-extra";
import path from "path";
import os from "os";
import crypto from "crypto";
import { protect } from "../middleware/auth.middleware.js";
import { CustomGif } from "../models/customGif.model.js";
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import mongoose from "mongoose";
import Status from "../models/status.model.js";
import { Connection } from "../models/connection.model.js";
import AdmZip from "adm-zip";
import { createEncryptStream, createDecryptStream, incrementIV, getKey, encryptBuffer } from "../utils/mediaEncryption.js";
import { redis } from "../lib/redis.js";
import sharp from "sharp";
import { execFile } from "child_process";

const router = express.Router();

// Cache invalidation helper for custom GIFs
const invalidateCustomGifCache = async (userId) => {
  if (!userId) return;
  const userIdStr = userId.toString();
  try {
    await redis.del(`cache:custom_sections:${userIdStr}`);
    let cursor = "0";
    const pattern = `cache:custom_gifs:${userIdStr}:*`;
    do {
      const reply = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = reply[0];
      const keys = reply[1];
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch (err) {
    console.error("[invalidateCustomGifCache] error:", err.message);
  }
};

// =============================================================================
// Cloudflare R2 Client
// =============================================================================

const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// =============================================================================
// ENV
// =============================================================================

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

// Example:
// https://pub-xxxxx.r2.dev
// OR
// https://cdn.yourdomain.com

const PUBLIC_BASE_URL = process.env.R2_PUBLIC_URL;

class MultiFileReadStream extends Readable {
    constructor(chunkPaths) {
        super();
        this.chunkPaths = chunkPaths;
        this.currentIndex = 0;
        this.currentStream = null;
    }

    _read() {
        if (this.currentStream) {
            this.currentStream.resume();
            return;
        }

        if (this.currentIndex >= this.chunkPaths.length) {
            this.push(null);
            return;
        }

        const chunkPath = this.chunkPaths[this.currentIndex++];
        this.currentStream = fs.createReadStream(chunkPath);

        this.currentStream.on("data", (chunk) => {
            if (!this.push(chunk)) {
                this.currentStream.pause();
            }
        });

        this.currentStream.on("end", () => {
            this.currentStream = null;
            this._read();
        });

        this.currentStream.on("error", (err) => {
            this.destroy(err);
        });
    }

    _destroy(err, callback) {
        if (this.currentStream) {
            this.currentStream.destroy();
        }
        callback(err);
    }
}

class OffsetSkipStream extends Transform {
    constructor(offset) {
        super();
        this.offset = offset;
        this.skipped = 0;
    }

    _transform(chunk, encoding, callback) {
        if (this.skipped < this.offset) {
            const needed = this.offset - this.skipped;
            if (chunk.length <= needed) {
                this.skipped += chunk.length;
                return callback();
            } else {
                const slice = chunk.subarray(needed);
                this.skipped = this.offset;
                this.push(slice);
                return callback();
            }
        }
        this.push(chunk);
        callback();
    }
}
// =============================================================================
// Public URL Helper
// =============================================================================

function getPublicFileUrl(key) {
    return `/api/media?key=${encodeURIComponent(key)}&v=v1`;
}

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
    return target;
}

// =============================================================================
// Upload File To R2
// =============================================================================

async function uploadToR2(filePath, key, mimeType) {
    const fileBuffer = await fs.promises.readFile(filePath);
    const encryptedBuffer = encryptBuffer(fileBuffer, "v1");
    await s3.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: encryptedBuffer,
            ContentType: mimeType,
            CacheControl: "public, max-age=31536000",
        })
    );
    return getPublicFileUrl(key);
}

async function deleteFromR2(url) {
    try {
        if (!url) return;
        let key = "";
        if (url.startsWith("/api/media")) {
            const parsed = new URL(url, "http://localhost");
            key = parsed.searchParams.get("key");
        } else if (url.startsWith(PUBLIC_BASE_URL)) {
            key = url.replace(`${PUBLIC_BASE_URL}/`, "");
        } else {
            try {
                const parsed = new URL(url);
                key = parsed.searchParams.get("key");
            } catch {
                return;
            }
        }
        if (!key) return;

        await s3.send(
            new DeleteObjectCommand({
                Bucket: BUCKET,
                Key: key,
            })
        );
    } catch (err) {
        console.error("[deleteFromR2] failed:", err);
    }
}

// =============================================================================
// Helpers
// =============================================================================

function makeDocumentUrls(originalUrl, fileName, fileSize) {
    return {
        type: "document",
        original: originalUrl,
        cover_270: null,
        thumb_50: null,
        fileName: fileName,
        fileSize: fileSize,
    };
}

function extractVideoFrame(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        execFile("ffmpeg", [
            "-y",
            "-i", inputPath,
            "-ss", "00:00:01",
            "-vframes", "1",
            "-f", "image2",
            outputPath
        ], (err, stdout, stderr) => {
            if (err) {
                console.error("[FFmpeg] extraction failed:", err, stderr);
                return reject(err);
            }
            resolve();
        });
    });
}

function getMediaDuration(filePath) {
    return new Promise((resolve) => {
        execFile("ffmpeg", ["-i", filePath], (err, stdout, stderr) => {
            const output = stderr || stdout || "";
            const match = output.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
            if (match) {
                const hours = parseInt(match[1], 10);
                const minutes = parseInt(match[2], 10);
                const seconds = parseFloat(match[3]);
                const totalSeconds = hours * 3600 + minutes * 60 + seconds;
                resolve(totalSeconds);
            } else {
                resolve(null);
            }
        });
    });
}

function stripAudioTrack(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        execFile("ffmpeg", [
            "-y",
            "-i", inputPath,
            "-c:v", "copy",
            "-an",
            outputPath
        ], (err, stdout, stderr) => {
            if (err) {
                console.error("[FFmpeg] Audio stripping failed:", err, stderr);
                return reject(err);
            }
            resolve();
        });
    });
}

async function generateAndUploadThumbnail(filePath, originalKey, isVideo) {
    const tempCoverPath = path.join(os.tmpdir(), `cover_${crypto.randomUUID()}.jpg`);
    const tempCompressedCoverPath = path.join(os.tmpdir(), `cover_270_${crypto.randomUUID()}.jpg`);
    const tempThumbPath = path.join(os.tmpdir(), `thumb_50_${crypto.randomUUID()}.jpg`);

    try {
        if (isVideo) {
            await extractVideoFrame(filePath, tempCoverPath);
        } else {
            await fs.promises.copyFile(filePath, tempCoverPath);
        }

        // Generate cover_270 (270px width)
        await sharp(tempCoverPath)
            .resize(270)
            .jpeg({ quality: 80 })
            .toFile(tempCompressedCoverPath);

        // Generate thumb_50 (50px width)
        await sharp(tempCoverPath)
            .resize(50)
            .jpeg({ quality: 70 })
            .toFile(tempThumbPath);

        const coverKey = originalKey + "_cover.jpg";
        const thumbKey = originalKey + "_thumb.jpg";

        const coverUrl = await uploadToR2(tempCompressedCoverPath, coverKey, "image/jpeg");
        const thumbUrl = await uploadToR2(tempThumbPath, thumbKey, "image/jpeg");

        await Promise.all([
            fse.remove(tempCoverPath).catch(() => {}),
            fse.remove(tempCompressedCoverPath).catch(() => {}),
            fse.remove(tempThumbPath).catch(() => {})
        ]);

        return { cover_270: coverUrl, thumb_50: thumbUrl };
    } catch (err) {
        console.error("[generateAndUploadThumbnail] failed:", err);
        await Promise.all([
            fse.remove(tempCoverPath).catch(() => {}),
            fse.remove(tempCompressedCoverPath).catch(() => {}),
            fse.remove(tempThumbPath).catch(() => {})
        ]);
        return { cover_270: null, thumb_50: null };
    }
}

// =============================================================================
// Safe File Name
// =============================================================================

function generateFileKey(fileName, mimeType) {
    const ext = path.extname(fileName) || `.${mimeType.split("/")[1]}`;
    const cleanName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueId = crypto.randomUUID();
    return `chat_media/${uniqueId}_${cleanName}${ext}`;
}

// =============================================================================
// Multer
// =============================================================================

const chunkUpload = multer({
    dest: path.join(os.tmpdir(), "chunks"),
    limits: { fileSize: 5 * 1024 * 1024, },
});

const diskUpload = multer({
    dest: os.tmpdir(),
    limits: {
        files: 1,
        fileSize: 500 * 1024 * 1024,
    },
});

// =============================================================================
// Upload Small File
// =============================================================================

router.post("/api/upload", protect, diskUpload.single("file"), async (req, res) => {

    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded", });
    }
    const { mimetype, path: tmpPath, originalname, } = req.file;
    const isVideo = mimetype.startsWith("video/");
    const isAudio = mimetype.startsWith("audio/");
    const isDocument = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",
    ].includes(mimetype);
    const key = generateFileKey(originalname, mimetype);

    try {
        const url = await uploadToR2(tmpPath, key, mimetype);

        let cover_270 = null;
        let thumb_50 = null;
        if (isVideo || mimetype.startsWith("image/")) {
            const thumbs = await generateAndUploadThumbnail(tmpPath, key, isVideo);
            cover_270 = thumbs.cover_270;
            thumb_50 = thumbs.thumb_50;
        }

        let duration = null;
        if (isVideo || isAudio) {
            duration = await getMediaDuration(tmpPath);
        }

        await fse.remove(tmpPath);

        if (isVideo) {
            return res.json({
                type: "video",
                original: url,
                cover_270: cover_270,
                thumb_50: thumb_50,
                duration: duration
            });
        }
        if (isAudio) {
            return res.json({
                type: "audio",
                original: url,
                cover_270: null,
                thumb_50: null,
                duration: duration
            });
        }
        if (isDocument) {
            return res.json(makeDocumentUrls(url, originalname, req.file.size));
        }
        
        // It's an image
        return res.json({
            type: "image",
            original: url,
            cover_270: cover_270 || url,
            thumb_50: thumb_50 || url
        });

    } catch (err) {
        console.error("[upload] R2 error:", err?.name, err?.message);

        await fse.remove(tmpPath).catch(() => { });
        return res.status(500).json({ error: "Upload failed", });
    }
}
);

// =============================================================================
// Upload Custom GIF
// =============================================================================
router.post("/api/gifs/upload", protect, diskUpload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        const section = req.body.section ? req.body.section.trim() : "My GIFs";
        if (!section) {
            return res.status(400).json({ error: "Section name is required" });
        }

        const isZip = req.file.mimetype === "application/zip" ||
            req.file.mimetype === "application/x-zip-compressed" ||
            path.extname(req.file.originalname).toLowerCase() === ".zip";

        if (isZip) {
            const zipPath = req.file.path;
            const extractTempDir = path.join(os.tmpdir(), `extract_${Date.now()}_${crypto.randomUUID()}`);
            await fse.ensureDir(extractTempDir);

            try {
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(extractTempDir, true);

                // Collect all files to upload
                const filesToUpload = [];

                const collectFiles = async (dir) => {
                    const entries = await fse.readdir(dir, { withFileTypes: true });
                    for (const entry of entries) {

                        const fullPath = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            await collectFiles(fullPath);
                        } else if (entry.isFile() && [".gif", ".webp", ".m4v", ".m4bb", ".mp4"].includes(path.extname(entry.name).toLowerCase())) {
                            filesToUpload.push({
                                fullPath,
                                name: entry.name
                            });
                        }
                    }
                };

                await collectFiles(extractTempDir);

                // Parallel uploads with bounded concurrency
                const uploadedGifs = [];
                const concurrencyLimit = 10;
                let activeIndex = 0;

                const worker = async () => {
                    while (activeIndex < filesToUpload.length) {
                        const index = activeIndex++;
                        const file = filesToUpload[index];
                        if (!file) break;

                        const safeSection = section.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() || "user_gifs";
                        const safeFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
                        const key = `custom_gifs/${req.user._id}/${safeSection}/${Date.now()}-${crypto.randomUUID().substring(0, 8)}-${safeFileName}`;

                        const ext = path.extname(file.name).toLowerCase();
                        let mimeType = "image/gif";
                        if (ext === ".webp") mimeType = "image/webp";
                        else if (ext === ".m4v") mimeType = "video/x-m4v";
                        else if (ext === ".m4bb" || ext === ".mp4") mimeType = "video/mp4";

                        const url = await uploadToR2(file.fullPath, key, mimeType);
                        const customGif = new CustomGif({
                            user: req.user._id,
                            section: section,
                            url: url,
                            fileName: file.name,
                            keyVersion: "v1"
                        });
                        await customGif.save();
                        uploadedGifs.push(customGif);
                    }
                };

                const workers = Array.from({ length: Math.min(concurrencyLimit, filesToUpload.length) }, worker);
                await Promise.all(workers);

                // Clean up temp extracted files and zip file
                await fse.remove(zipPath).catch(() => { });
                await fse.remove(extractTempDir).catch(() => { });

                if (uploadedGifs.length === 0) {
                    return res.status(400).json({ error: "No GIF, WEBP or Video files found inside the ZIP archive." });
                }

                await invalidateCustomGifCache(req.user._id);

                return res.json({ status: true, isZip: true, count: uploadedGifs.length, data: uploadedGifs });
            } catch (zipErr) {
                console.error("[gifs/upload] ZIP extraction error:", zipErr);
                await fse.remove(zipPath).catch(() => { });
                await fse.remove(extractTempDir).catch(() => { });
                return res.status(500).json({ error: "Failed to extract or process ZIP archive." });
            }
        } else {
            const safeSection = section.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() || "user_gifs";
            const safeFileName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9_.-]/g, "_");
            const key = `custom_gifs/${req.user._id}/${safeSection}/${Date.now()}-${safeFileName}`;

            const url = await uploadToR2(req.file.path, key, req.file.mimetype);
            await fse.remove(req.file.path).catch(() => { });

            const customGif = new CustomGif({
                user: req.user._id,
                section: section,
                url: url,
                fileName: req.file.originalname,
                keyVersion: "v1"
            });
            await customGif.save();

            await invalidateCustomGifCache(req.user._id);

            res.json({ status: true, data: customGif });
        }
    } catch (err) {
        console.error("[gifs/upload] error:", err);
        if (req.file && req.file.path) {
            await fse.remove(req.file.path).catch(() => { });
        }
        res.status(500).json({ error: "Failed to upload GIF" });
    }
});

router.get("/api/gifs/custom", protect, async (req, res) => {
    try {
        const userId = req.user._id.toString();

        if (req.query.sectionsOnly === "true") {
            const cacheKey = `cache:custom_sections:${userId}`;
            const cachedSections = await redis.get(cacheKey);
            if (cachedSections) {
                return res.json(JSON.parse(cachedSections));
            }

            const sections = await CustomGif.distinct("section", { user: req.user._id });
            const responsePayload = { status: true, data: sections };
            await redis.setex(cacheKey, 3600, JSON.stringify(responsePayload));
            return res.json(responsePayload);
        }

        const section = req.query.section || "My GIFs";
        const limit = parseInt(req.query.limit) || 14;
        const offset = parseInt(req.query.offset) || 0;

        const cacheKey = `cache:custom_gifs:${userId}:${section}:${limit}:${offset}`;
        const cachedGifs = await redis.get(cacheKey);
        if (cachedGifs) {
            return res.json(JSON.parse(cachedGifs));
        }

        const query = { user: req.user._id, section };

        const gifs = await CustomGif.find(query)
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit);

        const responsePayload = { status: true, data: gifs };
        await redis.setex(cacheKey, 3600, JSON.stringify(responsePayload));

        res.json(responsePayload);
    } catch (err) {
        console.error("[gifs/custom] error:", err);
        res.status(500).json({ error: "Failed to fetch custom GIFs" });
    }
});

// Delete single custom GIF
router.delete("/api/gifs/custom/:id", protect, async (req, res) => {
    try {
        const gif = await CustomGif.findOne({ _id: req.params.id, user: req.user._id });
        if (!gif) {
            return res.status(404).json({ error: "GIF not found" });
        }
        await deleteFromR2(gif.url);
        await CustomGif.deleteOne({ _id: gif._id });

        await invalidateCustomGifCache(req.user._id);

        res.json({ status: true, message: "GIF deleted successfully" });
    } catch (err) {
        console.error("[gifs/delete] error:", err);
        res.status(500).json({ error: "Failed to delete GIF" });
    }
});

// Delete entire custom GIF section/tab
router.delete("/api/gifs/custom/section/:sectionName", protect, async (req, res) => {
    try {
        const sectionName = req.params.sectionName;
        const gifs = await CustomGif.find({ user: req.user._id, section: sectionName });
        for (const gif of gifs) {
            await deleteFromR2(gif.url);
        }
        await CustomGif.deleteMany({ user: req.user._id, section: sectionName });

        await invalidateCustomGifCache(req.user._id);

        res.json({ status: true, message: "Section and its GIFs deleted successfully" });
    } catch (err) {
        console.error("[gifs/deleteSection] error:", err);
        res.status(500).json({ error: "Failed to delete section" });
    }
});

// =============================================================================
// Upload Status
// =============================================================================

router.get("/api/upload-status/:fileId", protect, async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Check if completed in Redis
        const cachedCompleted = await redis.get(`cache:upload_completed:${fileId}`);
        if (cachedCompleted) {
            return res.json({ success: true, completed: true, data: JSON.parse(cachedCompleted) });
        }

        const chunkDir = path.join(os.tmpdir(), "chunks", fileId);
        if (!(await fse.pathExists(chunkDir))) {
            return res.json({ success: true, chunksReceived: [] });
        }
        const files = await fse.readdir(chunkDir);
        const chunksReceived = files.map(f => Number(f)).filter(n => !isNaN(n));
        return res.json({ success: true, chunksReceived });
    } catch (err) {
        console.error("[upload-status] error:", err);
        return res.status(500).json({ error: "Failed to get upload status" });
    }
});

// =============================================================================
// Upload Chunk
// =============================================================================

router.post("/api/upload-chunk",
    protect,
    chunkUpload.single("chunk"),
    async (req, res) => {
        try {
            const { fileId, chunkIndex, } = req.body;
            if (!req.file) {
                return res.status(400).json({ error: "No chunk uploaded", });
            }

            const chunkDir = path.join(os.tmpdir(), "chunks", fileId);
            await fse.ensureDir(chunkDir);
            await fse.move(req.file.path, path.join(chunkDir, String(chunkIndex)), { overwrite: true, });

            return res.json({ success: true, });
        } catch (err) {
            console.error("[upload-chunk] error:", err?.name, err?.message);
            return res.status(500).json({ error: "Chunk upload failed", });
        }
    }
);

// =============================================================================
// Complete Upload
// =============================================================================

router.post("/api/complete-upload", protect, express.json({ limit: "1024mb" }),
    async (req, res) => {
        const { fileId, fileName, mimeType, muted } = req.body;
        console.log("[Complete Upload Payload]", { fileId, fileName, mimeType, muted });
        const chunkDir = path.join(os.tmpdir(), "chunks", fileId);
        try {
            // Check if already completed in Redis
            const cachedCompleted = await redis.get(`cache:upload_completed:${fileId}`);
            if (cachedCompleted) {
                console.log("[Complete Upload Cached]", fileId);
                return res.json(JSON.parse(cachedCompleted));
            }

            // =========================================================================
            // Get Chunks & Calculate Total Size
            // =========================================================================
            const chunkFiles = (
                await fse.readdir(chunkDir)).sort((a, b) => Number(a) - Number(b));

            let totalSize = 0;
            const chunkPaths = [];
            for (const chunkFile of chunkFiles) {
                const chunkPath = path.join(chunkDir, chunkFile);
                chunkPaths.push(chunkPath);
                const stat = await fse.stat(chunkPath);
                totalSize += stat.size;
            }

            const isVideo = mimeType.startsWith("video/");
            const isAudio = mimeType.startsWith("audio/");
            const isDocument = [
                "application/pdf",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/vnd.ms-powerpoint",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "text/plain",
                "text/csv",
            ].includes(mimeType);

            const key = generateFileKey(fileName, mimeType);

            // =========================================================================
            // Mute Video on Server Side if Requested
            // =========================================================================
            let finalUploadPath = null;
            let finalUploadSize = totalSize;
            const isMutedVideo = isVideo && (muted === true || muted === "true" || muted === "1");
            console.log("[Mute Decision]", { isVideo, isMutedVideo, muted });

            if (isMutedVideo) {
                console.log("[Processing Muted Video]", fileId);
                const ext = path.extname(fileName) || (mimeType.includes("webm") ? ".webm" : ".mp4");
                const tempMergedPath = path.join(os.tmpdir(), `${fileId}_merged_temp${ext}`);
                const tempMutedPath = path.join(os.tmpdir(), `${fileId}_muted_temp${ext}`);
                try {
                    // Merge chunks to tempMergedPath
                    await new Promise((resolve, reject) => {
                        const writeStream = fse.createWriteStream(tempMergedPath);
                        const readStream = new MultiFileReadStream(chunkPaths);
                        readStream.pipe(writeStream);
                        writeStream.on("finish", resolve);
                        writeStream.on("error", reject);
                        readStream.on("error", reject);
                    });

                    // Strip audio using FFmpeg
                    await stripAudioTrack(tempMergedPath, tempMutedPath);
                    finalUploadPath = tempMutedPath;

                    const stat = await fse.stat(tempMutedPath);
                    finalUploadSize = stat.size;

                    // Cleanup temp merged file early
                    await fse.remove(tempMergedPath).catch(() => {});
                } catch (muteErr) {
                    console.error("[FFmpeg] Server-side video audio stripping failed, falling back to original:", muteErr);
                    // Ensure cleanup of any temp files created
                    await fse.remove(tempMergedPath).catch(() => {});
                    await fse.remove(tempMutedPath).catch(() => {});
                    finalUploadPath = null;
                    finalUploadSize = totalSize;
                }
            }

            // =========================================================================
            // Stream Merge, Encrypt, and Upload Direct to R2
            // =========================================================================
            const bodyStream = finalUploadPath 
                ? fse.createReadStream(finalUploadPath) 
                : new MultiFileReadStream(chunkPaths);
            const encryptStream = createEncryptStream("v1");
            const pipedStream = bodyStream.pipe(encryptStream);

            await s3.send(
                new PutObjectCommand({
                    Bucket: BUCKET,
                    Key: key,
                    Body: pipedStream,
                    ContentType: mimeType,
                    ContentLength: finalUploadSize + 16,
                    CacheControl: "public, max-age=31536000",
                })
            );

            const url = getPublicFileUrl(key);

            // =========================================================================
            // Generate Thumbnails & Metadata
            // =========================================================================
            let cover_270 = null;
            let thumb_50 = null;
            let duration = null;

            if (isVideo || isAudio) {
                if (finalUploadPath) {
                    // Use the already muted file on disk
                    try {
                        if (isVideo) {
                            const thumbnails = await generateAndUploadThumbnail(finalUploadPath, key, true);
                            cover_270 = thumbnails.cover_270;
                            thumb_50 = thumbnails.thumb_50;
                        }
                        duration = await getMediaDuration(finalUploadPath);
                    } catch (thumbErr) {
                        console.error("Failed to process muted file for thumbnails/duration:", thumbErr);
                    }
                } else {
                    // Generate thumbnails in parallel by temporarily merging chunks to one file
                    const tempMergedPath = path.join(os.tmpdir(), `${fileId}_merged_temp`);
                    try {
                        await new Promise((resolve, reject) => {
                            const writeStream = fse.createWriteStream(tempMergedPath);
                            const readStream = new MultiFileReadStream(chunkPaths);
                            readStream.pipe(writeStream);
                            writeStream.on("finish", resolve);
                            writeStream.on("error", reject);
                            readStream.on("error", reject);
                        });

                        if (isVideo) {
                            const thumbnails = await generateAndUploadThumbnail(tempMergedPath, key, true);
                            cover_270 = thumbnails.cover_270;
                            thumb_50 = thumbnails.thumb_50;
                        }

                        if (isVideo || isAudio) {
                            duration = await getMediaDuration(tempMergedPath);
                        }
                    } catch (thumbErr) {
                        console.error("Failed to process merged file for chunked upload:", thumbErr);
                    } finally {
                        await fse.remove(tempMergedPath).catch(() => {});
                    }
                }
            }

            // Cleanup finalUploadPath (the muted temp file) if present
            if (finalUploadPath) {
                await fse.remove(finalUploadPath).catch(() => {});
            }

            // =========================================================================
            // Cleanup Chunks Directory
            // =========================================================================
            await fse.remove(chunkDir);

            // =========================================================================
            // Response
            // =========================================================================
            let responseData;
            if (isVideo) {
                responseData = {
                    type: "video",
                    original: url,
                    cover_270: cover_270,
                    thumb_50: thumb_50,
                    duration: duration,
                    muted: isMutedVideo
                };
            } else if (isDocument) {
                responseData = makeDocumentUrls(url, fileName, totalSize);
            } else if (isAudio) {
                responseData = {
                    type: "audio",
                    original: url,
                    cover_270: null,
                    thumb_50: null,
                    duration: duration
                };
            } else {
                responseData = {
                    type: "image",
                    original: url,
                    cover_270: cover_270 || url,
                    thumb_50: thumb_50 || url
                };
            }

            await redis.setex(`cache:upload_completed:${fileId}`, 86400, JSON.stringify(responseData));
            return res.json(responseData);

        } catch (err) {
            console.error("[complete-upload] error:", err?.name, err?.message);
            await fse.remove(chunkDir).catch(() => { });
            return res.status(500).json({ error: "Finalize upload failed", });
        }
    }
);

// =============================================================================
// Download & Decrypt Media (with Authentication & Rate Limiting)
// =============================================================================

const mediaRateLimiter = async (req, res, next) => {
    if (process.env.NODE_ENV === "test" || process.env.NODE_ENV !== "PROD") {
        return next();
    }
    try {
        const userId = req.user?._id?.toString() || req.ip;
        const key = `ratelimit:media:${userId}`;
        
        const requests = await redis.incr(key);
        if (requests === 1) {
            await redis.expire(key, 60);
        }
        
        if (requests > 150) {
            return res.status(429).json({ error: "Too many requests. Please try again later." });
        }
        next();
    } catch (err) {
        console.error("Rate limiter error:", err);
        next();
    }
};

// Redis-backed media metadata cache helpers to avoid redundant HeadObject and IV fetches from R2
async function getRedisCachedMediaMetadata(key) {
    try {
        const metaStr = await redis.get(`cache:media_metadata:${key}`);
        if (!metaStr) return null;
        const parsed = JSON.parse(metaStr);
        return {
            iv: Buffer.from(parsed.iv, "hex"),
            totalEncryptedSize: parsed.totalEncryptedSize,
            contentType: parsed.contentType
        };
    } catch (err) {
        console.error("[getRedisCachedMediaMetadata] error:", err.message);
        return null;
    }
}

async function setRedisCachedMediaMetadata(key, cached) {
    try {
        await redis.setex(`cache:media_metadata:${key}`, 3600, JSON.stringify({
            iv: cached.iv.toString("hex"),
            totalEncryptedSize: cached.totalEncryptedSize,
            contentType: cached.contentType
        }));
    } catch (err) {
        console.error("[setRedisCachedMediaMetadata] error:", err.message);
    }
}

async function serveEncryptedMedia(req, res, key, version, activeS3, activeBucket) {
    const rangeHeader = req.headers.range;

    // Fetch status metadata if key is status
    let statusDuration = 15;
    let cacheMaxAge = 3600; // All media files (images, video status, regular files) cached for exactly 1 hour
    if (key.startsWith("status/")) {
        try {
            const filename = key.split("/").pop();
            const statusDoc = await Status.findOne({ mediaUrl: new RegExp(filename, "i") }).lean();
            if (statusDoc && statusDoc.duration) {
                statusDuration = statusDoc.duration;
            }
        } catch (dbErr) {
            // fallback
        }
    }

    const isStatusFullLoad = key.startsWith("status/") && 
        (!rangeHeader || rangeHeader.replace(/\s/g, "") === "bytes=0-");

    if (rangeHeader && !isStatusFullLoad) {
        let cached = await getRedisCachedMediaMetadata(key);
        if (!cached) {
            // Fetch the 16-byte IV and parse total size from Content-Range in one call
            const ivResponse = await activeS3.send(
                new GetObjectCommand({
                    Bucket: activeBucket,
                    Key: key,
                    Range: "bytes=0-15",
                })
            );

            const ivChunks = [];
            for await (const chunk of ivResponse.Body) {
                ivChunks.push(chunk);
            }
            const iv = Buffer.concat(ivChunks);

            if (iv.length < 16) {
                throw new Error("Failed to retrieve encryption IV");
            }

            const contentRange = ivResponse.ContentRange;
            if (!contentRange) {
                throw new Error("Missing Content-Range header from S3 range response");
            }
            const totalEncryptedSize = parseInt(contentRange.split("/")[1], 10);
            const contentType = ivResponse.ContentType || "application/octet-stream";

            cached = {
                iv,
                totalEncryptedSize,
                contentType
            };
            await setRedisCachedMediaMetadata(key, cached);
        }

        const { iv, totalEncryptedSize, contentType } = cached;
        const totalPlaintextSize = totalEncryptedSize - 16;

        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);

        // Dynamically compute chunk size: 6 seconds of video for status uploads (subsequent), default 10MB otherwise
        let chunkLimit = 1024 * 1024 * 10; // Default 10MB
        if (key.startsWith("status/")) {
            // If it's the very first request (start is 0), fetch a larger chunk to satisfy the preloading target in one request (up to 11s)
            const targetSec = (start === 0) ? Math.min(statusDuration * 0.25, 11) : 6;
            const estimatedBytes = Math.ceil((totalPlaintextSize / statusDuration) * targetSec);
            
            // For first request, clamp between 2MB and 5MB. For subsequent requests, clamp between 1.2MB and 3MB.
            const minClamp = (start === 0) ? 2 * 1024 * 1024 : 1.2 * 1024 * 1024;
            const maxClamp = (start === 0) ? 5 * 1024 * 1024 : 3 * 1024 * 1024;
            
            chunkLimit = Math.max(minClamp, Math.min(maxClamp, estimatedBytes));
        }

        let end = parts[1] ? parseInt(parts[1], 10) : start + chunkLimit - 1;
        if (end - start + 1 > chunkLimit) {
            end = start + chunkLimit - 1;
        }
        if (end >= totalPlaintextSize) {
            end = totalPlaintextSize - 1;
        }

        if (start >= totalPlaintextSize || end >= totalPlaintextSize) {
            res.status(416).set("Content-Range", `bytes */${totalPlaintextSize}`).end();
            return;
        }

        const blockNumber = Math.floor(start / 16);
        const byteOffset = start % 16;

        const startByteR2 = 16 + blockNumber * 16;
        const endByteR2 = 16 + end;

        const ciphertextResponse = await activeS3.send(
            new GetObjectCommand({
                Bucket: activeBucket,
                Key: key,
                Range: `bytes=${startByteR2}-${endByteR2}`,
            })
        );

        res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${totalPlaintextSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": (end - start) + 1,
            "Content-Type": contentType,
            "Cache-Control": `public, max-age=${cacheMaxAge}`,
        });

        const adjustedIv = incrementIV(iv, blockNumber);
        const cipherKey = getKey(version);
        const decipher = crypto.createDecipheriv("aes-256-ctr", cipherKey, adjustedIv);
        const skipStream = new OffsetSkipStream(byteOffset);

        ciphertextResponse.Body.pipe(decipher).pipe(skipStream).pipe(res);

        res.on("close", () => {
            if (ciphertextResponse.Body && typeof ciphertextResponse.Body.destroy === "function") {
                ciphertextResponse.Body.destroy();
            }
            decipher.destroy();
            skipStream.destroy();
        });
    } else {
        // Full file request
        const response = await activeS3.send(
            new GetObjectCommand({
                Bucket: activeBucket,
                Key: key,
            })
        );

        res.writeHead(200, {
            "Content-Type": response.ContentType || "application/octet-stream",
            "Cache-Control": `public, max-age=${cacheMaxAge}`,
        });

        const decryptStream = createDecryptStream(version);
        response.Body.pipe(decryptStream).pipe(res);

        res.on("close", () => {
            if (response.Body && typeof response.Body.destroy === "function") {
                response.Body.destroy();
            }
            decryptStream.destroy();
        });
    }
}

router.get("/api/media", protect, mediaRateLimiter, async (req, res) => {
    if (req.query.page) {
        try {
            const myId = req.user._id;
            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 10;
            const skip = (page - 1) * limit;

            const query = {
                $or: [
                    { from: myId },
                    { to: myId }
                ],
                type: { $in: ["image", "video", "audio"] }
            };

            const media = await Message.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const formattedMedia = media.map(m => {
                const encryptedFileId = extractKeyFromUrl(m.content);
                return {
                    id: m._id || m.tempId,
                    type: m.type,
                    thumbnail: `/api/thumbnail/${m._id || m.tempId}`,
                    size: m.fileSize || "0 B",
                    duration: m.duration || null,
                    encryptedFileId: encryptedFileId,
                    createdAt: m.createdAt
                };
            });

            return res.json({ status: true, count: formattedMedia.length, data: formattedMedia });
        } catch (err) {
            console.error("[api/media] list error:", err);
            return res.status(500).json({ error: "Failed to load media list" });
        }
    }

    const key = req.query.key;
    const version = req.query.v || "v1";

    if (!key) {
        return res.status(400).json({ error: "Missing key parameter" });
    }

    const isSongKey = key.startsWith("songs/");
    const activeS3 = isSongKey ? songS3 : s3;
    const activeBucket = isSongKey ? SONG_BUCKET : BUCKET;

    // Authorization Check on Decryption for logs/
    if (key.startsWith("logs/")) {
        // key format: logs/log_${ownerId}_${timestamp}.jpg
        const parts = key.split("_");
        if (parts.length >= 2) {
            const ownerId = parts[1];
            if (ownerId !== req.user._id.toString()) {
                const owner = await User.findById(ownerId);
                if (!owner || !owner.securityLogEnabled || !owner.securityLogAllowedFriends.map(id => id.toString()).includes(req.user._id.toString())) {
                    return res.status(403).json({ error: "Access denied to security logs" });
                }
            }
        }
    }

    try {
        await serveEncryptedMedia(req, res, key, version, activeS3, activeBucket);
    } catch (err) {
        if (err.name === "NoSuchKey" || err.Code === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
            console.warn(`[api/media] Key not found in S3 storage: ${key}`);
            return res.status(404).json({ error: "Media not found" });
        }
        console.error("[api/media] decryption/download error:", err);
        return res.status(500).json({ error: "Failed to download or decrypt media" });
    }
});

// =============================================================================
// Serve Default SVG Placeholders
// =============================================================================
function serveDefaultPlaceholder(res, type) {
    res.writeHead(200, {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
    });
    if (type === "video") {
        res.end(`
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
                <rect width="100%" height="100%" fill="#1f1f1f"/>
                <circle cx="100" cy="100" r="30" fill="none" stroke="#888" stroke-width="4"/>
                <polygon points="92,85 115,100 92,115" fill="#888"/>
            </svg>
        `.trim());
    } else {
        res.end(`
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
                <rect width="100%" height="100%" fill="#1f1f1f"/>
                <rect x="50" y="50" width="100" height="100" rx="10" fill="none" stroke="#888" stroke-width="4"/>
                <circle cx="80" cy="80" r="12" fill="#888"/>
                <path d="M50,130 L85,95 L110,120 L130,100 L150,120" fill="none" stroke="#888" stroke-width="4"/>
            </svg>
        `.trim());
    }
}

// =============================================================================
// GET /api/thumbnail/:id (and alias /thumbnail/:id)
// =============================================================================
router.get(["/api/thumbnail/:id", "/thumbnail/:id"], protect, async (req, res) => {
    const id = req.params.id;
    let key = "";
    let message = null;
    try {
        message = await Message.findOne({ $or: [{ _id: mongoose.Types.ObjectId.isValid(id) ? id : null }, { tempId: id }] });
        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }
        
        // Authorization check: sender or receiver must be the current user
        if (message.from.toString() !== req.user._id.toString() && message.to.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "Access denied" });
        }

        const url = message.cover || message.thumb || (message.type === "video" ? null : message.content);
        if (!url) {
            return serveDefaultPlaceholder(res, message.type);
        }

        key = extractKeyFromUrl(url);
        if (!key) {
            return serveDefaultPlaceholder(res, message.type);
        }

        const version = message.keyVersion || "v1";

        const response = await s3.send(
            new GetObjectCommand({
                Bucket: BUCKET,
                Key: key,
            })
        );

        res.writeHead(200, {
            "Content-Type": response.ContentType || "image/jpeg",
            "Cache-Control": "public, max-age=3600",
        });

        const decryptStream = createDecryptStream(version);
        response.Body.pipe(decryptStream).pipe(res);

        res.on("close", () => {
            if (response.Body && typeof response.Body.destroy === "function") {
                response.Body.destroy();
            }
            decryptStream.destroy();
        });
    } catch (err) {
        if (err.name === "NoSuchKey" || err.Code === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
            console.warn(`[api/thumbnail] Key not found in S3 storage: ${key}`);
            return serveDefaultPlaceholder(res, message?.type);
        }
        console.error("[api/thumbnail] error:", err);
        return res.status(500).json({ error: "Failed to download or decrypt thumbnail" });
    }
});

// =============================================================================
// POST /api/media/decrypt (and alias /media/decrypt)
// =============================================================================
router.post(["/api/media/decrypt", "/media/decrypt"], protect, async (req, res) => {
    const { mediaId, key } = req.body;
    try {
        let message = null;
        let fileKey = null;

        if (mediaId) {
            message = await Message.findOne({
                _id: mongoose.Types.ObjectId.isValid(mediaId) ? mediaId : null,
                $or: [{ from: req.user._id }, { to: req.user._id }]
            });
            if (!message) {
                message = await Message.findOne({
                    tempId: mediaId,
                    $or: [{ from: req.user._id }, { to: req.user._id }]
                });
            }
            if (message) {
                fileKey = extractKeyFromUrl(message.content);
            } else {
                // Check if it's a security log photo ID
                const currentUser = await User.findById(req.user._id);
                let photo = currentUser.capturedPhotos?.find(p => p._id?.toString() === mediaId || p.id === mediaId);
                if (!photo) {
                    const whitelistedFriends = await User.find({
                        securityLogEnabled: true,
                        securityLogAllowedFriends: req.user._id
                    });
                    for (const friend of whitelistedFriends) {
                        photo = friend.capturedPhotos?.find(p => p._id?.toString() === mediaId || p.id === mediaId);
                        if (photo) break;
                    }
                }
                if (photo) {
                    fileKey = extractKeyFromUrl(photo.url);
                    message = { keyVersion: photo.keyVersion || "v1" };
                } else {
                    // Check if it's a Status document
                    const status = await Status.findById(mongoose.Types.ObjectId.isValid(mediaId) ? mediaId : null);
                    if (status) {
                        const isOwn = status.userId.toString() === req.user._id.toString();
                        let allowed = isOwn;
                        if (!allowed) {
                            const isConnected = await Connection.findOne({
                                $or: [
                                    { sender: status.userId, receiver: req.user._id },
                                    { sender: req.user._id, receiver: status.userId }
                                ],
                                status: "accepted"
                            });
                            if (isConnected) {
                                if (status.audience === "public" || status.audience === "contacts") {
                                    allowed = true;
                                } else if (status.audience === "exceptContacts") {
                                    allowed = !status.audienceList.some(id => id.toString() === req.user._id.toString());
                                } else if (status.audience === "onlyContacts") {
                                    allowed = status.audienceList.some(id => id.toString() === req.user._id.toString());
                                }
                            }
                        }
                        if (allowed) {
                            fileKey = extractKeyFromUrl(status.mediaUrl);
                            message = { keyVersion: "v1" };
                        }
                    }
                }
            }
        } else if (key) {
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            message = await Message.findOne({
                $or: [{ from: req.user._id }, { to: req.user._id }],
                content: { $regex: escapedKey }
            });
            if (message) {
                fileKey = key;
            } else {
                // Check if it's a status key
                const status = await Status.findOne({ mediaUrl: { $regex: escapedKey } });
                if (status) {
                    const isOwn = status.userId.toString() === req.user._id.toString();
                    let allowed = isOwn;
                    if (!allowed) {
                        const isConnected = await Connection.findOne({
                            $or: [
                                { sender: status.userId, receiver: req.user._id },
                                { sender: req.user._id, receiver: status.userId }
                            ],
                            status: "accepted"
                        });
                        if (isConnected) {
                            if (status.audience === "public" || status.audience === "contacts") {
                                    allowed = true;
                            } else if (status.audience === "exceptContacts") {
                                allowed = !status.audienceList.some(id => id.toString() === req.user._id.toString());
                            } else if (status.audience === "onlyContacts") {
                                allowed = status.audienceList.some(id => id.toString() === req.user._id.toString());
                            }
                        }
                    }
                    if (allowed) {
                        fileKey = key;
                        message = { keyVersion: "v1" };
                    }
                }
            }
        }

        if (!message || !fileKey) {
            return res.status(404).json({ error: "Media not found or unauthorized access" });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const version = message.keyVersion || "v1";

        await redis.set(`stream:${token}`, JSON.stringify({
            key: fileKey,
            version: version,
            mediaId: message._id || message.tempId
        }), "EX", 60);

        return res.json({ token });
    } catch (err) {
        console.error("[api/media/decrypt] error:", err);
        return res.status(500).json({ error: "Failed to generate decryption token" });
    }
});

// =============================================================================
// GET /api/media/stream/:token (and alias /media/stream/:token)
// =============================================================================
router.get(["/api/media/stream/:token", "/media/stream/:token"], async (req, res) => {
    const { token } = req.params;
    try {
        const streamDataStr = await redis.get(`stream:${token}`);
        if (!streamDataStr) {
            return res.status(403).json({ error: "Invalid or expired token" });
        }

        const { key, version } = JSON.parse(streamDataStr);
        // Extend token expiration by another 60 seconds
        await redis.expire(`stream:${token}`, 60);

        await serveEncryptedMedia(req, res, key, version, s3, BUCKET);
    } catch (err) {
        if (err.name === "NoSuchKey" || err.Code === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
            return res.status(404).json({ error: "Media not found" });
        }
        console.error("[api/media/stream] error:", err);
        return res.status(500).json({ error: "Streaming error" });
    }
});

export default router;