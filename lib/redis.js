import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined
});

redis.on("connect", () => {
  console.log("✅ Redis Connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis Error:", err.message);
});