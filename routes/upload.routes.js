import express from "express";
import multer from "multer";

import { S3Client, PutObjectCommand, } from "@aws-sdk/client-s3";

import fs from "fs";
import fse from "fs-extra";
import path from "path";
import os from "os";
import crypto from "crypto";

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

router.post("/api/upload", diskUpload.single("file"), async (req, res) => {

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
// Upload Chunk
// =============================================================================

router.post("/api/upload-chunk",
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

router.post("/api/complete-upload", express.json(),
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