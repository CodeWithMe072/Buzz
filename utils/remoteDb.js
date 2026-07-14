import { MongoClient } from "mongodb";

const REMOTE_MONGO_URI = "mongodb+srv://0AgvcOGFc4gYxuFS:sanjay14581@cluster1.jbvslou.mongodb.net/";

/**
 * Replicates a song's metadata to the remote MongoDB cluster.
 * Uses upsert logic based on videoId.
 * Runs in the background and logs failures gracefully to prevent process interruption.
 */
export async function saveSongToBothDbs(songData) {
  if (!songData || !songData.videoId) return;

  try {
    const client = new MongoClient(REMOTE_MONGO_URI);
    await client.connect();
    
    const db = client.db("test");
    const collection = db.collection("songs");

    const payload = {
      videoId: songData.videoId,
      title: songData.title || "Unknown Title",
      channelTitle: songData.channelTitle || "Unknown Channel",
      thumbnailUrl: songData.thumbnailUrl || "",
      audioUrl: songData.audioUrl || "",
      duration: songData.duration || 0,
      updatedAt: new Date()
    };

    const existing = await collection.findOne({ videoId: songData.videoId });
    if (!existing) {
      payload.createdAt = new Date();
      await collection.insertOne(payload);
      console.log(`[RemoteDB] Replicated new song catalog entry: ${payload.title} (${payload.videoId})`);
    } else {
      await collection.updateOne(
        { videoId: songData.videoId },
        { $set: payload }
      );
      console.log(`[RemoteDB] Replicated update for song: ${payload.title} (${payload.videoId})`);
    }

    await client.close();
  } catch (err) {
    console.error(`[RemoteDB] Failed to replicate song ${songData.videoId} to remote DB:`, err.message);
  }
}
