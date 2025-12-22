import mongoose from "mongoose";

export async function connectMongo() {
  try {
    await mongoose.connect("mongodb+srv://0AgvcOGFc4gYxuFS:sanjay14581@cluster1.jbvslou.mongodb.net/?appName=chat_app?retryWrites=true&w=majority", {
      autoIndex: true,
    });

    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed",err);
    process.exit(1); // crash app if DB is down
  }
}
