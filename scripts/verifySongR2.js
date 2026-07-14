import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const oldBucket = process.env.R2_BUCKET || "test-chat";
  const newBucket = process.env.SONG_R2_BUCKET || "buzz-song";

  const oldS3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const newS3 = new S3Client({
    region: "auto",
    endpoint: process.env.SONG_R2_ENDPOINT || process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.SONG_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.SONG_R2_SECRET_ACCESS_KEY,
    },
  });

  const key = "songs/alX-ld96FpI.mp3";

  try {
    await oldS3.send(new HeadObjectCommand({ Bucket: oldBucket, Key: key }));
    console.log(`[VERIFY] Key "${key}" exists in OLD bucket "${oldBucket}"`);
  } catch (err) {
    console.log(`[VERIFY] Key "${key}" DOES NOT exist in OLD bucket "${oldBucket}" (${err.message})`);
  }

  try {
    await newS3.send(new HeadObjectCommand({ Bucket: newBucket, Key: key }));
    console.log(`[VERIFY] Key "${key}" exists in NEW bucket "${newBucket}"`);
  } catch (err) {
    console.log(`[VERIFY] Key "${key}" DOES NOT exist in NEW bucket "${newBucket}" (${err.message})`);
  }
}

run();
