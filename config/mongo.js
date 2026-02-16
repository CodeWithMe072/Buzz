import mongoose from "mongoose";

export async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: true,
    });

    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed",err);
    process.exit(1); // crash app if DB is down
  }
}
