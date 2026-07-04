import "dotenv/config";

const REQUIRED_PROD_ENV = [
  "CLIENT_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "MEDIA_ENCRYPTION_KEY",
  "MONGO_URI",
  "REDIS_URL",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

export const isProd = process.env.NODE_ENV === "PROD";

const parsedOrigins = isProd
  ? (process.env.CLIENT_URL || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [];

if (isProd) {
  parsedOrigins.push("https://web.telegram.org");
  parsedOrigins.push("https://tg-webview");
  parsedOrigins.push("https://telegram.org");
}

export const clientOrigins = isProd ? parsedOrigins : "*";

if (isProd) {
  const missing = REQUIRED_PROD_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required production env vars: ${missing.join(", ")}`);
  }
}
