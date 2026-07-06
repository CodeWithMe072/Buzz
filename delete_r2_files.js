import dotenv from "dotenv";
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Load environment variables
dotenv.config();

// Configure Cloudflare R2 client
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET;

async function deleteR2Files() {
  console.log("🧹 Starting R2 selective deletion process...");

  if (!BUCKET) {
    console.error("❌ Error: R2_BUCKET environment variable is not defined.");
    return;
  }

  // Parse command line arguments
  // Example usage: node delete_r2_files.js --before 2026-07-01T12:00:00Z
  let cutoffDateStr = "";
  const args = process.argv.slice(2);
  const beforeIdx = args.indexOf("--before");
  if (beforeIdx !== -1 && args[beforeIdx + 1]) {
    cutoffDateStr = args[beforeIdx + 1];
  }

  if (!cutoffDateStr) {
    console.log("💡 Usage: node delete_r2_files.js --before <ISO_DATE_STRING>");
    console.log("   Example: node delete_r2_files.js --before \"2026-07-01T00:00:00Z\"");
    
    // Default to a safe fallback (e.g., files older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    cutoffDateStr = thirtyDaysAgo.toISOString();
    console.log(`⚠️  No --before date provided. Using default fallback: older than 30 days (${cutoffDateStr})`);
  }

  const cutoffDate = new Date(cutoffDateStr);
  if (isNaN(cutoffDate.getTime())) {
    console.error(`❌ Error: Invalid date format "${cutoffDateStr}". Please use ISO 8601 format (e.g. YYYY-MM-DDTHH:mm:ssZ).`);
    return;
  }

  console.log(`🕒 Deleting files modified BEFORE: ${cutoffDate.toLocaleString()} (${cutoffDate.toISOString()})`);

  try {
    let isTruncated = true;
    let nextContinuationToken = undefined;
    let totalScanned = 0;
    let totalDeleted = 0;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: nextContinuationToken,
      });

      const listResponse = await s3.send(listCommand);
      const contents = listResponse.Contents || [];

      for (const object of contents) {
        const key = object.Key;
        if (!key) continue;

        // Skip directories/folders
        if (key.endsWith("/")) continue;

        totalScanned++;
        const lastModified = new Date(object.LastModified);

        if (lastModified < cutoffDate) {
          console.log(`🗑️  Deleting (Modified: ${lastModified.toISOString()}): ${key}`);
          try {
            const deleteCommand = new DeleteObjectCommand({
              Bucket: BUCKET,
              Key: key,
            });
            await s3.send(deleteCommand);
            totalDeleted++;
            console.log(`✅ Deleted successfully: ${key}`);
          } catch (delErr) {
            console.error(`❌ Failed to delete ${key}:`, delErr.message);
          }
        } else {
          console.log(`✔️  Skipping (Modified: ${lastModified.toISOString()}): ${key}`);
        }
      }

      isTruncated = listResponse.IsTruncated;
      nextContinuationToken = listResponse.NextContinuationToken;
    }

    console.log("--------------------------------------------------");
    console.log(`🏁 Selective R2 deletion completed.`);
    console.log(`📊 Scanned: ${totalScanned} files.`);
    console.log(`🗑️  Deleted: ${totalDeleted} files.`);
    console.log(`✔️  Retained: ${totalScanned - totalDeleted} files.`);
  } catch (err) {
    console.error("💥 Critical R2 error:", err.message);
  }
}

deleteR2Files();
