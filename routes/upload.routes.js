import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import { Readable } from "stream";
import fse from "fs-extra";
import path from "path";
import os from "os";
import crypto from "crypto";
import { protect } from "../middleware/auth.middleware.js";
import { CustomGif } from "../models/customGif.model.js";
import AdmZip from "adm-zip";
import { createEncryptStream, createDecryptStream, incrementIV, getKey, encryptBuffer } from "../utils/mediaEncryption.js";
import { redis } from "../lib/redis.js";
import sharp from "sharp";
import { execFile } from "child_process";

const router = express.Router();

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
// =============================================================================
// Public URL Helper
// =============================================================================

function getPublicFileUrl(key) {
    return `/api/media?key=${encodeURIComponent(key)}&v=v1`;
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

function makeImageUrls(originalUrl) {
    return {
        type: "image",
        original: originalUrl,
        cover_270: originalUrl,
        thumb_50: originalUrl,
    };
}

function makeVideoUrls(originalUrl) {
    return {
        type: "video",
        original: originalUrl,
        cover_270: null,
        thumb_50: null,
    };
}

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
        fileSize: 100 * 1024 * 1024,
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

        await fse.remove(tmpPath);

        if (isVideo) {
            return res.json({
                type: "video",
                original: url,
                cover_270: cover_270,
                thumb_50: thumb_50
            });
        }
        if (isAudio) {
            return res.json({
                type: "audio",
                original: url,
                cover_270: null,
                thumb_50: null,
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
                        console.log("entry", entry)
                        const fullPath = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            await collectFiles(fullPath);
                        } else if (entry.isFile() && [".gif", ".webp", ".m4v", ".m4bb", ".mp4"].includes(path.extname(entry.name).toLowerCase())) {
                            console.log("fullpath", fullPath)
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
                        console.log("url", url)
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
        const gifs = await CustomGif.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json({ status: true, data: gifs });
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
        res.json({ status: true, message: "Section and its GIFs deleted successfully" });
    } catch (err) {
        console.error("[gifs/deleteSection] error:", err);
        res.status(500).json({ error: "Failed to delete section" });
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
        const { fileId, fileName, mimeType, } = req.body;
        const chunkDir = path.join(os.tmpdir(), "chunks", fileId);
        try {
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

            // =========================================================================
            // Stream Merge, Encrypt, and Upload Direct to R2
            // =========================================================================
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

            // Stream chunks directly through encryption stream to s3
            const mergedStream = new MultiFileReadStream(chunkPaths);
            const encryptStream = createEncryptStream("v1");
            const pipedStream = mergedStream.pipe(encryptStream);

            await s3.send(
                new PutObjectCommand({
                    Bucket: BUCKET,
                    Key: key,
                    Body: pipedStream,
                    ContentType: mimeType,
                    ContentLength: totalSize + 16,
                    CacheControl: "public, max-age=31536000",
                })
            );

            const url = getPublicFileUrl(key);

            // Generate thumbnails in parallel by temporarily merging chunks to one file
            let cover_270 = null;
            let thumb_50 = null;
            if (isVideo || mimeType.startsWith("image/")) {
                const tempMergedPath = path.join(os.tmpdir(), `merge_${fileId}_${Date.now()}`);
                try {
                    const writeStream = fs.createWriteStream(tempMergedPath);
                    for (const chunkPath of chunkPaths) {
                        const chunkData = await fs.promises.readFile(chunkPath);
                        writeStream.write(chunkData);
                    }
                    writeStream.end();
                    await new Promise((resolve) => writeStream.on("finish", resolve));

                    const thumbs = await generateAndUploadThumbnail(tempMergedPath, key, isVideo);
                    cover_270 = thumbs.cover_270;
                    thumb_50 = thumbs.thumb_50;
                } catch (thumbErr) {
                    console.error("Failed to generate thumbnail for chunked upload:", thumbErr);
                } finally {
                    await fse.remove(tempMergedPath).catch(() => {});
                }
            }

            // =========================================================================
            // Cleanup
            // =========================================================================
            await fse.remove(chunkDir);

            // =========================================================================
            // Response
            // =========================================================================
            if (isVideo) {
                return res.json({
                    type: "video",
                    original: url,
                    cover_270: cover_270,
                    thumb_50: thumb_50
                });
            }
            if (isDocument) {
                return res.json(makeDocumentUrls(url, fileName, totalSize));
            }

            if (isAudio) {
                return res.json({
                    type: "audio",
                    original: url,
                    cover_270: null,
                    thumb_50: null,
                });
            }

            return res.json({
                type: "image",
                original: url,
                cover_270: cover_270 || url,
                thumb_50: thumb_50 || url
            });

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

// In-memory media cache to avoid redundant HeadObject and IV fetches from R2
const mediaCache = new Map();
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL = 3600 * 1000; // 1 hour

function getCachedMedia(key) {
    const entry = mediaCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        mediaCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCachedMedia(key, data) {
    if (mediaCache.size >= MAX_CACHE_SIZE) {
        // Evict oldest entry
        const oldestKey = mediaCache.keys().next().value;
        mediaCache.delete(oldestKey);
    }
    mediaCache.set(key, {
        data,
        timestamp: Date.now()
    });
}

router.get("/api/media", protect, mediaRateLimiter, async (req, res) => {
    const key = req.query.key;
    const version = req.query.v || "v1";

    if (!key) {
        return res.status(400).json({ error: "Missing key parameter" });
    }

    try {
        const rangeHeader = req.headers.range;

        if (rangeHeader) {
            let cached = getCachedMedia(key);
            if (!cached) {
                // Fetch the 16-byte IV from R2
                const ivResponse = await s3.send(
                    new GetObjectCommand({
                        Bucket: BUCKET,
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
                    return res.status(500).json({ error: "Failed to retrieve encryption IV" });
                }

                // Retrieve object metadata/size to calculate ranges
                const headInfo = await s3.send(
                    new HeadObjectCommand({
                        Bucket: BUCKET,
                        Key: key,
                    })
                );

                cached = {
                    iv,
                    totalEncryptedSize: headInfo.ContentLength,
                    contentType: headInfo.ContentType || "application/octet-stream"
                };
                setCachedMedia(key, cached);
            }

            const { iv, totalEncryptedSize, contentType } = cached;
            const totalPlaintextSize = totalEncryptedSize - 16;

            const parts = rangeHeader.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);

            // Limit chunk size to maximum 2MB for fast loading and low memory usage
            const maxChunkSize = 1024 * 1024 * 2; // 2MB
            let end = parts[1] ? parseInt(parts[1], 10) : start + maxChunkSize - 1;
            if (end - start + 1 > maxChunkSize) {
                end = start + maxChunkSize - 1;
            }
            if (end >= totalPlaintextSize) {
                end = totalPlaintextSize - 1;
            }

            if (start >= totalPlaintextSize || end >= totalPlaintextSize) {
                res.status(416).set("Content-Range", `bytes */${totalPlaintextSize}`).end();
                return;
            }

            const chunkSize = (end - start) + 1;
            const blockNumber = Math.floor(start / 16);
            const byteOffset = start % 16;

            const startByteR2 = 16 + blockNumber * 16;
            const endByteR2 = 16 + end;

            const ciphertextResponse = await s3.send(
                new GetObjectCommand({
                    Bucket: BUCKET,
                    Key: key,
                    Range: `bytes=${startByteR2}-${endByteR2}`,
                })
            );

            const ciphertextChunks = [];
            for await (const chunk of ciphertextResponse.Body) {
                ciphertextChunks.push(chunk);
            }
            const ciphertext = Buffer.concat(ciphertextChunks);

            const adjustedIv = incrementIV(iv, blockNumber);
            const cipherKey = getKey(version);
            const decipher = crypto.createDecipheriv("aes-256-ctr", cipherKey, adjustedIv);
            const decryptedWholeBlock = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            const finalDecryptedSlice = decryptedWholeBlock.subarray(byteOffset, byteOffset + chunkSize);

            res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${totalPlaintextSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": finalDecryptedSlice.length,
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000",
            });
            res.end(finalDecryptedSlice);
        } else {
            // Full file request
            const response = await s3.send(
                new GetObjectCommand({
                    Bucket: BUCKET,
                    Key: key,
                })
            );

            res.writeHead(200, {
                "Content-Type": response.ContentType || "application/octet-stream",
                "Cache-Control": "public, max-age=31536000",
            });

            const decryptStream = createDecryptStream(version);
            response.Body.pipe(decryptStream).pipe(res);
        }
    } catch (err) {
        if (err.name === "NoSuchKey" || err.Code === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
            console.warn(`[api/media] Key not found in S3 storage: ${key}`);
            return res.status(404).json({ error: "Media not found" });
        }
        console.error("[api/media] decryption/download error:", err);
        return res.status(500).json({ error: "Failed to download or decrypt media" });
    }
});

export default router;