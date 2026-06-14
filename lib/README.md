# Lib Folder (`/lib`)

This folder holds third-party client initializers and shared utility modules.

## Files

- [`redis.js`](file:///d:/Buzz/Buzz/lib/redis.js):
  - Initializes and configures the `ioredis` database connection client using `process.env.REDIS_URL`.
  - Configures connections strategies, retries, and errors events tracking.
  - Exported client instance is used throughout the app for managing user socket associations and real-time online tracking.
