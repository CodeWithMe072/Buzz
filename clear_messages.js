import mongoose from "mongoose";
import "dotenv/config";
import { Message } from "./models/message.model.js";

async function clear() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/chatapp");
  console.log("Connected to MongoDB");
  
  const res = await Message.deleteMany({});
  console.log("Deleted messages count:", res.deletedCount);
  
  await mongoose.disconnect();
}

clear().catch(console.error);
