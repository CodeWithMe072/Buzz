import mongoose from "mongoose";
import dns from "dns";

// Try setting DNS fallback only if DNS resolution is constrained
try {
  const currentServers = dns.getServers();
  if (!currentServers || !currentServers.length || currentServers.includes("127.0.0.1")) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  }
} catch (e) {
  console.warn("[MongoDB Config] Custom DNS setup notice:", e.message);
}

// Global Mongoose connection event monitoring
mongoose.connection.on("disconnected", () => {
  console.warn("[MongoDB] Connection lost to MongoDB cluster. Attempting automatic reconnect...");
});
mongoose.connection.on("reconnected", () => {
  console.log("[MongoDB] Reconnected to MongoDB Atlas cluster.");
});
mongoose.connection.on("error", (err) => {
  console.error("[MongoDB] Connection error:", err.message);
});

export const connectMongo = async () => {
  try {
    const maxPoolSize = parseInt(process.env.MONGO_MAX_POOL_SIZE) || 20;
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
    });
    console.log(`[MongoDB] Connected successfully (maxPoolSize: ${maxPoolSize})`);
  } catch (err) {
    console.error("[MongoDB] Connection failed:", err.message);
    process.exit(1);
  }
};
