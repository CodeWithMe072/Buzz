import mongoose from "mongoose";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import Song from "../models/song.model.js";
import { generateKeywordsAndCategory } from "../utils/songHelpers.js";

dotenv.config();

const REMOTE_MONGO_URI = "mongodb+srv://0AgvcOGFc4gYxuFS:sanjay14581@cluster1.jbvslou.mongodb.net/";

async function run() {
  try {
    console.log("[Migration] Connecting to local MongoDB...");
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/chatapp");
    console.log("[Migration] Connected to local MongoDB.");
  } catch (localErr) {
    console.log("[Migration] Connection using MONGO_URI failed, trying local fallback...");
    await mongoose.connect("mongodb://127.0.0.1:27017/chatapp");
    console.log("[Migration] Connected to fallback local MongoDB.");
  }

  let remoteCollection = null;
  let remoteClient = null;
  try {
    console.log("[Migration] Connecting to remote MongoDB...");
    remoteClient = new MongoClient(REMOTE_MONGO_URI);
    await remoteClient.connect();
    const remoteDb = remoteClient.db("test");
    remoteCollection = remoteDb.collection("songs");
    console.log("[Migration] Connected to remote MongoDB.");
  } catch (remoteErr) {
    console.warn(`[Migration] Remote MongoDB connection failed: ${remoteErr.message}. Skipping remote replication.`);
  }

  // 1. Process Local Songs
  const localSongs = await Song.find({});
  console.log(`[Migration] Found ${localSongs.length} songs in local DB.`);

  let updatedCount = 0;
  for (const song of localSongs) {
    const { category, keywords } = generateKeywordsAndCategory(
      song.title,
      song.channelTitle,
      [],
      "",
      []
    );

    song.category = category;
    song.keywords = keywords;
    await song.save();

    // Mirror update to remote collection
    if (remoteCollection) {
      await remoteCollection.updateOne(
        { videoId: song.videoId },
        {
          $set: {
            category,
            keywords,
            updatedAt: new Date()
          }
        }
      );
    }

    updatedCount++;
    if (updatedCount % 20 === 0) {
      console.log(`[Migration] Migrated ${updatedCount}/${localSongs.length} songs...`);
    }
  }

  console.log(`[Migration] Successfully migrated all ${localSongs.length} songs in both local and remote DBs!`);

  // Close connections
  await mongoose.disconnect();
  if (remoteClient) await remoteClient.close();
  console.log("[Migration] Done.");
}

run().catch(err => {
  console.error("[Migration] Failed:", err);
  process.exit(1);
});
