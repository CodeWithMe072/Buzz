import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";

// Create R2 S3 Client instance
const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const BUCKET = process.env.R2_BUCKET;

export class StreamingUploadManager {
    /**
     * Initializes a new Multipart Upload in Cloudflare R2 / S3
     * @param {string} fileKey 
     * @param {string} contentType 
     * @returns {Promise<string>} UploadId
     */
    static async init(fileKey, contentType = "application/octet-stream") {
        const command = new CreateMultipartUploadCommand({
            Bucket: BUCKET,
            Key: fileKey,
            ContentType: contentType,
        });
        const res = await s3.send(command);
        return res.UploadId;
    }

    /**
     * Uploads a single part (must be >= 5MB, except final part)
     * @param {string} fileKey 
     * @param {string} uploadId 
     * @param {number} partNumber 1-indexed part number
     * @param {Buffer} bodyBuffer 
     * @returns {Promise<{ PartNumber: number, ETag: string }>}
     */
    static async uploadPart(fileKey, uploadId, partNumber, bodyBuffer) {
        const command = new UploadPartCommand({
            Bucket: BUCKET,
            Key: fileKey,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: bodyBuffer,
        });
        const res = await s3.send(command);
        return {
            PartNumber: partNumber,
            ETag: res.ETag,
        };
    }

    /**
     * Completes a Multipart Upload after sorting all part ETags by PartNumber
     * @param {string} fileKey 
     * @param {string} uploadId 
     * @param {Array<{ PartNumber: number, ETag: string }>} parts 
     */
    static async complete(fileKey, uploadId, parts) {
        const sortedParts = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
        const command = new CompleteMultipartUploadCommand({
            Bucket: BUCKET,
            Key: fileKey,
            UploadId: uploadId,
            MultipartUpload: {
                Parts: sortedParts,
            },
        });
        return await s3.send(command);
    }

    /**
     * Aborts an incomplete Multipart Upload to prevent billing storage leaks
     * @param {string} fileKey 
     * @param {string} uploadId 
     */
    static async abort(fileKey, uploadId) {
        try {
            const command = new AbortMultipartUploadCommand({
                Bucket: BUCKET,
                Key: fileKey,
                UploadId: uploadId,
            });
            await s3.send(command);
            console.log(`[StreamingUploadManager] Aborted multipart upload: fileKey=${fileKey}, uploadId=${uploadId}`);
        } catch (err) {
            console.warn(`[StreamingUploadManager] Failed to abort multipart upload:`, err.message);
        }
    }
}
