import cron from "node-cron";
import Status from "../models/status.model.js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Helper to extract key from R2 URL
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
    return null;
}

export function startAutoPruneExpiredStatusesJob() {
    // Run every minute to prune expired statuses and clean up R2 storage
    cron.schedule("* * * * *", async () => {
        try {
            const now = new Date();
            const expiredStatuses = await Status.find({ expiresAt: { $lte: now } });

            if (expiredStatuses.length === 0) return;


            // Initialize S3/R2 client if credentials are set
            let s3 = null;
            const BUCKET = process.env.R2_BUCKET;

            if (process.env.R2_ENDPOINT && BUCKET) {
                s3 = new S3Client({
                    region: "auto",
                    endpoint: process.env.R2_ENDPOINT,
                    credentials: {
                        accessKeyId: process.env.R2_ACCESS_KEY_ID,
                        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
                    },
                });
            }

            for (const status of expiredStatuses) {
                // Delete main media object from R2
                if (status.mediaUrl && s3) {
                    const key = extractKeyFromUrl(status.mediaUrl);
                    if (key) {
                        try {
                            await s3.send(
                                new DeleteObjectCommand({
                                    Bucket: BUCKET,
                                    Key: key,
                                })
                            );
                        } catch (s3Err) {
                            console.error(`[Cron Job] Failed to delete R2 object for key ${key}:`, s3Err.message);
                        }
                    }
                }

                // Delete video thumbnail object from R2
                if (status.thumbnailUrl && s3) {
                    const thumbKey = extractKeyFromUrl(status.thumbnailUrl);
                    if (thumbKey) {
                        try {
                            await s3.send(
                                new DeleteObjectCommand({
                                    Bucket: BUCKET,
                                    Key: thumbKey,
                                })
                            );
                        } catch (s3Err) {
                            console.error(`[Cron Job] Failed to delete R2 thumbnail object for key ${thumbKey}:`, s3Err.message);
                        }
                    }
                }
            }

            // Remove documents from database
            const ids = expiredStatuses.map(s => s._id);
            const deleteResult = await Status.deleteMany({ _id: { $in: ids } });

        } catch (err) {
            console.error("[Cron Job] Expired status prune error:", err);
        }
    });
}
