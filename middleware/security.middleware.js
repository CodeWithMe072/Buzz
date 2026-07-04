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

export const authRateLimiter = createRateLimiter({
  keyPrefix: "auth",
  windowSeconds: 15 * 60,
  max: 30,
});

export const refreshRateLimiter = createRateLimiter({
  keyPrefix: "refresh",
  windowSeconds: 5 * 60,
  max: 60,
});

export const uploadRateLimiter = createRateLimiter({
  keyPrefix: "upload",
  windowSeconds: 60,
  max: 120,
  keyGenerator: (req) => req.user?._id?.toString() || getIp(req),
});
