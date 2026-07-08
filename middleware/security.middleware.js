import { redis } from "../lib/redis.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return null;
  }
}

export function csrfOriginGuard(allowedOrigins) {
  const allowed = Array.isArray(allowedOrigins) ? new Set(allowedOrigins) : null;

  return (req, res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();
    if (!req.cookies?.token && !req.cookies?.refreshToken) return next();

    const origin = normalizeOrigin(req.headers.origin);
    const referer = normalizeOrigin(req.headers.referer);
    const requestOrigin = origin || referer;

    const userAgent = req.headers["user-agent"] || "";
    const isTelegramClient = /telegram/i.test(userAgent);

    if (!requestOrigin) {
      if (isTelegramClient) {
        return next();
      }
      return res.status(403).json({ status: false, message: "Missing request origin" });
    }

    if (allowed && !allowed.has(requestOrigin)) {
      const isTelegramOrigin = 
        requestOrigin === "https://web.telegram.org" ||
        requestOrigin === "https://tg-webview" ||
        requestOrigin === "https://telegram.org" ||
        requestOrigin.endsWith(".telegram.org") ||
        isTelegramClient;

      if (!isTelegramOrigin) {
        return res.status(403).json({ status: false, message: "Invalid request origin" });
      }
    }

    next();
  };
}

export function createRateLimiter({
  keyPrefix,
  windowSeconds,
  max,
  keyGenerator = getIp,
}) {
  return async (req, res, next) => {
    if (process.env.NODE_ENV === "test" || process.env.NODE_ENV !== "PROD") {
      return next();
    }
    try {
      const key = `rate:${keyPrefix}:${keyGenerator(req)}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (count > max) {
        return res.status(429).json({
          status: false,
          message: "Too many requests. Please try again later.",
        });
      }

      next();
    } catch (err) {
      console.error("[RateLimit] Failed:", err.message);
      next();
    }
  };
}

export const authRateLimiter = advancedSecurityLimiter({
  keyPrefix: "auth",
  windowSeconds: 15 * 60,
  max: 30,
});

export const refreshRateLimiter = advancedSecurityLimiter({
  keyPrefix: "refresh",
  windowSeconds: 5 * 60,
  max: 60,
});

export const uploadRateLimiter = advancedSecurityLimiter({
  keyPrefix: "upload",
  windowSeconds: 60,
  max: 120,
});

// Advanced security rate limiter to block IP, Device ID, and User Account on violations
export function advancedSecurityLimiter({
  keyPrefix,
  windowSeconds = 60,
  max = 100,
  ipBlockDuration = 3600, // 1 hour block
  accountBlockDuration = 14400, // 4 hours block
  deviceBlockDuration = 14400, // 4 hours block
}) {
  return async (req, res, next) => {
    if (process.env.NODE_ENV === "test" || process.env.SKIP_RATE_LIMIT === "true") {
      return next();
    }

    const ip = getIp(req);
    const userId = req.user?._id?.toString();
    const deviceId = req.headers["x-device-id"] || req.cookies?.deviceId;

    try {
      // 1. Check if IP is blocked
      const isIpBlocked = await redis.get(`block:ip:${ip}`);
      if (isIpBlocked) {
        const ttl = await redis.ttl(`block:ip:${ip}`);
        return res.status(429).json({
          status: false,
          code: "IP_BLOCKED",
          message: `Suspected abuse. Your IP is blocked. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        });
      }

      // 2. Check if Device ID is blocked
      if (deviceId) {
        const isDeviceBlocked = await redis.get(`block:device:${deviceId}`);
        if (isDeviceBlocked) {
          const ttl = await redis.ttl(`block:device:${deviceId}`);
          return res.status(429).json({
            status: false,
            code: "DEVICE_BLOCKED",
            message: `Suspected abuse. This device is blocked. Try again in ${Math.ceil(ttl / 60)} minutes.`,
          });
        }
      }

      // 3. Check if User Account is blocked
      if (userId) {
        const isUserBlocked = await redis.get(`block:user:${userId}`);
        if (isUserBlocked) {
          const ttl = await redis.ttl(`block:user:${userId}`);
          return res.status(429).json({
            status: false,
            code: "ACCOUNT_BLOCKED",
            message: `Suspected abuse. Your account is temporarily locked. Try again in ${Math.ceil(ttl / 3600)} hours.`,
          });
        }
      }

      // 4. Rate counter check (IP-based and Account-based)
      const ipRateKey = `rate:ip:${keyPrefix}:${ip}`;
      const ipCount = await redis.incr(ipRateKey);
      if (ipCount === 1) {
        await redis.expire(ipRateKey, windowSeconds);
      }

      let userCount = 0;
      let userRateKey = null;
      if (userId) {
        userRateKey = `rate:user:${keyPrefix}:${userId}`;
        userCount = await redis.incr(userRateKey);
        if (userCount === 1) {
          await redis.expire(userRateKey, windowSeconds);
        }
      }

      // 5. Trigger blocks if limit exceeded
      if (ipCount > max || userCount > max) {
        // Trigger IP block
        await redis.setex(`block:ip:${ip}`, ipBlockDuration, "true");
        
        // Trigger Device block if ID exists
        if (deviceId) {
          await redis.setex(`block:device:${deviceId}`, deviceBlockDuration, "true");
        }

        // Trigger Account block if logged in
        if (userId) {
          await redis.setex(`block:user:${userId}`, accountBlockDuration, "true");
        }

        return res.status(429).json({
          status: false,
          code: "LIMIT_EXCEEDED",
          message: "Rate limit exceeded. Suspicious activity detected, security locks applied.",
        });
      }

      next();
    } catch (err) {
      console.error("[AdvancedLimiter] Error:", err.message);
      next();
    }
  };
}
