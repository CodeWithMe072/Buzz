import express from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { redis } from "./lib/redis.js";
import compression from "compression";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";

import { clientOrigins, isProd } from "./config/env.js";
import { connectMongo } from "./config/mongo.js";
import authRoutes from "./routes/auth.routes.js";
import connectionRoutes from "./routes/connection.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import statusRoutes from "./routes/status.routes.js";
import songRoutes from "./routes/song.routes.js";
import initSocket from "./sockets/chat.sockets.js";
import { startMessageStatusSyncJob } from "./jobs/messageStatusSync.js";
import { startAutoPruneExpiredStatusesJob } from "./jobs/autoPruneExpiredStatuses.js";
import { startTrendingSongsJob } from "./jobs/trendingSongsJob.js";
import "./jobs/songWorker.js";
import webrtcRoutes from "./routes/webrtc.routes.js";
import componentRoutes from "./routes/component.routes.js";
import { protect, readUserFromCookie } from "./middleware/auth.middleware.js";
import { csrfOriginGuard, advancedSecurityLimiter } from "./middleware/security.middleware.js";
import crypto from "crypto";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: clientOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 20000,
});

// Configure Socket.io Redis Adapter with separate pub/sub connections
const pubClient = redis.duplicate();
const subClient = redis.duplicate();
io.adapter(createAdapter(pubClient, subClient));

const PORT = process.env.PORT || 5500;

/* ---------- Database ---------- */
await connectMongo();

// Trigger auto-migration of song search keywords
import("./utils/songHelpers.js").then(({ autoMigrateSongs }) => {
  autoMigrateSongs();
}).catch(err => {
  console.error("[Startup] Failed to initialize song keyword auto-migration:", err);
});

/* ---------- Compression ---------- */
app.use(compression());

/* ---------- Cookies & Authentication Parsing ---------- */
app.use(cookieParser());
app.use(readUserFromCookie);

/* ---------- Global Rate Limiter (Redis-backed Account & Device Security Limiter) ---------- */
const limiter = advancedSecurityLimiter({
  keyPrefix: "global",
  windowSeconds: 60,
  max: 200, // Limit each client IP/user/device to 200 requests per minute globally
});
// app.use(limiter);

/* ---------- CORS ---------- */
app.use(cors({
  origin: clientOrigins,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));

/* ---------- Body Parsing ---------- */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(csrfOriginGuard(clientOrigins));

/* ---------- Static files with Cache-Control ---------- */
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: isProd ? "1d" : 0,
  setHeaders: (res, filepath) => {
    if (isProd) {
      if (filepath.endsWith(".html") || filepath.endsWith(".ejs")) {
        res.setHeader("Cache-Control", "no-cache");
      } else {
        res.setHeader("Cache-Control", "public, max-age=86400, must-revalidate");
      }
    } else {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    }
  }
}));


/* ---------- View engine ---------- */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/* ---------- Page routes ---------- */
// All pages are served from index.ejs — client-side JS handles screens
app.get("/", (req, res) => {
  // Ensure they have a device ID cookie
  if (!req.cookies?.deviceId) {
    const newDeviceId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    res.cookie("deviceId", newDeviceId, {
      httpOnly: true,
      secure: isProd,
      maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
    });
  }

  const user = req.user;
  let isServerLogin = true;
  if (!user) {
    isServerLogin = false;
  }
  res.render("index", { isShowDashboard: user?.showDashboard ?? true, isServerLogin });
});

// Redirect any other page hit back to "/" so the SPA handles it
app.get("/app", (req, res) => res.redirect("/"));
app.get("/login", (req, res) => res.redirect("/"));
/* ---------- req.io Middleware ---------- */
app.use((req, res, next) => {
  req.io = io;
  next();
});

/* ---------- API routes ---------- */
app.use(componentRoutes);
app.use("/api/webrtc", webrtcRoutes);
app.use(authRoutes);
app.use(connectionRoutes);
app.use(chatRoutes);
app.use(uploadRoutes);
app.use(statusRoutes);
app.use(songRoutes);

/* ---------- Version endpoint (for auto-reload) ---------- */
const APP_VERSION = process.env.APP_VERSION;
app.get("/api/version", protect, (req, res) => res.json({ data: APP_VERSION }));

/* ---------- 404 handler ---------- */
app.use((req, res) => {
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/auth") ||
    req.path.startsWith("/connections")
  ) {
    return res.status(404).json({ status: false, message: "Route not found" });
  }
  res.redirect("/");
});

/* ---------- Socket.io ---------- */
initSocket(io);

/* ---------- Background jobs ---------- */
startMessageStatusSyncJob(io);
startAutoPruneExpiredStatusesJob();
startTrendingSongsJob();

/* ---------- Start ---------- */
if (isProd) {
  server.listen(process.env.PORT || 8080, "0.0.0.0", () => {
    console.log(`[Server] Running on port ${process.env.PORT || 8080}`);
  });
} else {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[Server] Running on http://127.0.0.1:${PORT}`);
  });
}
