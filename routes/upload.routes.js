import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import fse from "fs-extra";
import path from "path";
import os from "os";
import crypto from "crypto";
import { protect } from "../middleware/auth.middleware.js";
import { CustomGif } from "../models/customGif.model.js";
import AdmZip from "adm-zip";

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
// =============================================================================
// Public URL Helper
// =============================================================================

function getPublicFileUrl(key) {
    return `${PUBLIC_BASE_URL}/${key}`;
}

// =============================================================================
// Upload File To R2
// =============================================================================

async function uploadToR2(filePath, key, mimeType) {
    const fileStream = fs.createReadStream(filePath);
    await s3.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: fileStream,
            ContentType: mimeType,
            CacheControl: "public, max-age=31536000",
        })
    );
    return getPublicFileUrl(key);
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

        await fse.remove(tmpPath);

        if (isVideo) {
            return res.json(makeVideoUrls(url));
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
        return res.json(makeImageUrls(url));

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

                const uploadedGifs = [];
                const findGifs = async (dir) => {
                    const entries = await fse.readdir(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            await findGifs(fullPath);
                        } else if (entry.isFile() && [".gif", ".webp", ".m4v", ".m4bb", ".mp4"].includes(path.extname(entry.name).toLowerCase())) {
                            const safeSection = section.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() || "user_gifs";
                            const safeFileName = entry.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
                            const key = `custom_gifs/${req.user._id}/${safeSection}/${Date.now()}-${crypto.randomUUID().substring(0, 8)}-${safeFileName}`;

                            const ext = path.extname(entry.name).toLowerCase();
                            let mimeType = "image/gif";
                            if (ext === ".webp") mimeType = "image/webp";
                            else if (ext === ".m4v") mimeType = "video/x-m4v";
                            else if (ext === ".m4bb" || ext === ".mp4") mimeType = "video/mp4";

                            const url = await uploadToR2(fullPath, key, mimeType);
                            
                            const customGif = new CustomGif({
                                user: req.user._id,
                                section: section,
                                url: url,
                                fileName: entry.name
                            });
                            await customGif.save();
                            uploadedGifs.push(customGif);
                        }
                    }
                };

                await findGifs(extractTempDir);

                // Clean up temp extracted files and zip file
                await fse.remove(zipPath).catch(() => {});
                await fse.remove(extractTempDir).catch(() => {});

                if (uploadedGifs.length === 0) {
                    return res.status(400).json({ error: "No GIF, WEBP or Video files found inside the ZIP archive." });
                }

                return res.json({ status: true, isZip: true, count: uploadedGifs.length, data: uploadedGifs });
            } catch (zipErr) {
                console.error("[gifs/upload] ZIP extraction error:", zipErr);
                await fse.remove(zipPath).catch(() => {});
                await fse.remove(extractTempDir).catch(() => {});
                return res.status(500).json({ error: "Failed to extract or process ZIP archive." });
            }
        } else {
            const safeSection = section.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() || "user_gifs";
            const safeFileName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9_.-]/g, "_");
            const key = `custom_gifs/${req.user._id}/${safeSection}/${Date.now()}-${safeFileName}`;

            const url = await uploadToR2(req.file.path, key, req.file.mimetype);
            await fse.remove(req.file.path).catch(() => {});

            const customGif = new CustomGif({
                user: req.user._id,
                section: section,
                url: url,
                fileName: req.file.originalname
            });
            await customGif.save();

            res.json({ status: true, data: customGif });
        }
    } catch (err) {
        console.error("[gifs/upload] error:", err);
        if (req.file && req.file.path) {
            await fse.remove(req.file.path).catch(() => {});
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

router.post("/api/complete-upload", protect, express.json(),
    async (req, res) => {
        const { fileId, fileName, mimeType, } = req.body;
        const chunkDir = path.join(os.tmpdir(), "chunks", fileId);
        const mergedPath = path.join(os.tmpdir(), `${Date.now()}_${fileName}`);
        try {
            // =========================================================================
            // Get Chunks
            // =========================================================================
            const chunkFiles = (
                await fse.readdir(chunkDir)).sort((a, b) => Number(a) - Number(b));

            // =========================================================================
            // Merge Chunks Using Streams
            // =========================================================================

            const writeStream = fs.createWriteStream(mergedPath);
            for (const chunkFile of chunkFiles) {
                const chunkPath = path.join(chunkDir, chunkFile);
                await new Promise((resolve, reject) => {
                    const readStream = fs.createReadStream(chunkPath);
                    readStream.on("error", reject);
                    readStream.on("end", resolve);
                    readStream.pipe(writeStream, { end: false, });
                }
                );
            }

            writeStream.end();

            await new Promise((resolve, reject) => {
                writeStream.on("finish", resolve);
                writeStream.on("error", reject);
            });

            // =========================================================================
            // Upload To R2
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
            const url = await uploadToR2(mergedPath, key, mimeType);
            // =========================================================================
            // Cleanup
            // =========================================================================
            // Get file size BEFORE deleting
            const fileStat = await fse.stat(mergedPath);
            await fse.remove(chunkDir);
            await fse.remove(mergedPath);

            // =========================================================================
            // Response
            // =========================================================================

            if (isVideo) {
                return res.json(makeVideoUrls(url));
            }
            if (isDocument) {
                return res.json(makeDocumentUrls(url, fileName, fileStat.size));
            }

            if (isAudio) {
                return res.json({
                    type: "audio",
                    original: url,
                    cover_270: null,
                    thumb_50: null,
                });
            }

            return res.json(makeImageUrls(url));

        } catch (err) {
            console.error("[complete-upload] error:", err?.name, err?.message);
            await fse.remove(chunkDir).catch(() => { });
            await fse.remove(mergedPath).catch(() => { });
            return res.status(500).json({ error: "Finalize upload failed", });
        }
    }
);

export default router;