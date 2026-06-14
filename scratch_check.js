import mongoose from "mongoose";
import "dotenv/config";
import { Message } from "./models/message.model.js";

async function check() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/chatapp");
  console.log("Connected to MongoDB");
  
  const messages = await Message.find({}).sort({ createdAt: -1 }).limit(10);
  console.log("Latest 10 messages:");
  messages.forEach(m => {
    console.log(`From: ${m.from}, To: ${m.to}, Content: "${m.content}", Status:`, m.status);
  });
  
  await mongoose.disconnect();
}

check().catch(console.error);
