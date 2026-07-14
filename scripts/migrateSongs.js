import { MongoClient } from "mongodb";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env
dotenv.config();

const LOCAL_MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/";
const REMOTE_MONGO_URI = "mongodb+srv://0AgvcOGFc4gYxuFS:sanjay14581@cluster1.jbvslou.mongodb.net/";

async function run() {
  console.log("=== STARTING SONG CATALOG MIGRATION ===");

  // 1. Sync MongoDB Databases
  console.log("\n--- STEP 1: Syncing MongoDB Song Metadata ---");
  let localClient, remoteClient;
  try {
    localClient = new MongoClient(LOCAL_MONGO_URI);
    remoteClient = new MongoClient(REMOTE_MONGO_URI);

    await localClient.connect();
    await remoteClient.connect();

    const localDb = localClient.db("test");
    const remoteDb = remoteClient.db("test");

    const localSongsColl = localDb.collection("songs");
    const remoteSongsColl = remoteDb.collection("songs");

    const localSongs = await localSongsColl.find({}).toArray();
    const remoteSongs = await remoteSongsColl.find({}).toArray();

    console.log(`Found ${localSongs.length} songs in Local DB.`);
    console.log(`Found ${remoteSongs.length} songs in Remote DB.`);

    const localMap = new Map(localSongs.map(s => [s.videoId, s]));
    const remoteMap = new Map(remoteSongs.map(s => [s.videoId, s]));

    let localToRemoteCount = 0;
    let remoteToLocalCount = 0;

    // Sync Local to Remote
    for (const song of localSongs) {
      if (!remoteMap.has(song.videoId)) {
        const payload = { ...song };
        delete payload._id; // Let remote MongoDB generate its own ObjectId
        await remoteSongsColl.insertOne(payload);
        localToRemoteCount++;
      }
    }

    // Sync Remote to Local
    for (const song of remoteSongs) {
      if (!localMap.has(song.videoId)) {
        const payload = { ...song };
        delete payload._id; // Let local MongoDB generate its own ObjectId
        await localSongsColl.insertOne(payload);
        remoteToLocalCount++;
      }
    }

    console.log(`Successfully synced ${localToRemoteCount} songs from Local to Remote DB.`);
    console.log(`Successfully synced ${remoteToLocalCount} songs from Remote to Local DB.`);

  } catch (err) {
    console.error("Error during MongoDB sync step:", err.message);
  } finally {
    if (localClient) await localClient.close();
    if (remoteClient) await remoteClient.close();
  }

  // 2. Sync R2 Bucket Assets
  console.log("\n--- STEP 2: Syncing R2 Bucket Song MP3 Assets ---");
  const oldBucket = process.env.R2_BUCKET || "test-chat";
  const newBucket = process.env.SONG_R2_BUCKET || "buzz-song";

  if (!process.env.R2_ACCESS_KEY_ID || !process.env.SONG_R2_ACCESS_KEY_ID) {
    console.warn("R2 credentials missing in .env. Skipping S3 assets sync.");
    return;
  }

  try {
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

    console.log(`Listing items from old bucket: "${oldBucket}" with prefix "songs/"...`);
    const listResponse = await oldS3.send(
      new ListObjectsV2Command({
        Bucket: oldBucket,
        Prefix: "songs/",
      })
    );

    const items = listResponse.Contents || [];
    console.log(`Found ${items.length} song items to copy.`);

    let copiedCount = 0;
    for (const item of items) {
      const key = item.Key;
      if (!key.endsWith(".mp3")) continue;

      console.log(`Copying "${key}" from old bucket "${oldBucket}" to new bucket "${newBucket}"...`);

      // Download from old bucket
      const getResponse = await oldS3.send(
        new GetObjectCommand({
          Bucket: oldBucket,
          Key: key,
        })
      );

      // Convert readable stream to Buffer
      const chunks = [];
      for await (const chunk of getResponse.Body) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      // Upload to new bucket
      await newS3.send(
        new PutObjectCommand({
          Bucket: newBucket,
          Key: key,
          Body: fileBuffer,
          ContentType: getResponse.ContentType || "audio/mpeg",
          CacheControl: "public, max-age=31536000",
        })
      );

      copiedCount++;
    }

    console.log(`=== MIGRATION COMPLETE: Copied ${copiedCount} files successfully ===`);
  } catch (err) {
    console.error("Error during R2 bucket sync step:", err.message);
  }
}

run();
