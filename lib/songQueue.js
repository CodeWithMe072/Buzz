import { Queue } from "bullmq";
import Redis from "ioredis";

// Create a dedicated Redis connection with maxRetriesPerRequest: null as required by BullMQ
const queueConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const songQueue = new Queue("song-download", {
  connection: queueConnection,
});
