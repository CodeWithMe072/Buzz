import mongoose from "mongoose";
import dns from "dns";

// Set DNS servers to Google Public DNS to resolve mongodb+srv SRV records
try {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (e) {
  console.warn("[MongoDB Config] Failed to set custom DNS servers:", e.message);
}

export const connectMongo = async () => {
  try {
    const maxPoolSize = parseInt(process.env.MONGO_MAX_POOL_SIZE) || 20;
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize,
      minPoolSize: 10,
    });
    console.log(`[MongoDB] Connected (poolSize: ${maxPoolSize})`);
  } catch (err) {
    console.error("[MongoDB] Connection failed:", err.message);
    process.exit(1);
  }
};
