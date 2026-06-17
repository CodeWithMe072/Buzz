import express from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";
import "dotenv/config";

import { connectMongo } from "./config/mongo.js";
import authRoutes from "./routes/auth.routes.js";
import connectionRoutes from "./routes/connection.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import initSocket from "./sockets/chat.sockets.js";
import { startMessageStatusSyncJob } from "./jobs/messageStatusSync.js";
import webrtcRoutes from "./routes/webrtc.routes.js";
import { protect } from "./middleware/auth.middleware.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 3000,
  pingInterval: 5000,
});
const PORT = process.env.PORT || 5500;

/* ---------- Database ---------- */
await connectMongo();

/* ---------- CORS ---------- */
app.use(cors({
  origin: process.env.NODE_ENV === "PROD"
    ? process.env.CLIENT_URL || "*"
    : "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));

/* ---------- Body Parsing ---------- */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

/* ---------- Static files with Cache-Control ---------- */
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1d",
  setHeaders: (res, filepath) => {
    if (filepath.endsWith(".html") || filepath.endsWith(".ejs")) {
      res.setHeader("Cache-Control", "no-cache");
    } else {
      res.setHeader("Cache-Control", "public, max-age=86400, must-revalidate");
    }
  }
}));


/* ---------- View engine ---------- */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/* ---------- Page routes ---------- */
// All pages are served from index.ejs — client-side JS handles screens
app.get("/", (req, res) => res.render("index"));

// Redirect any other page hit back to "/" so the SPA handles it
app.get("/app", (req, res) => res.redirect("/"));
app.get("/login", (req, res) => res.redirect("/"));
/* ---------- req.io Middleware ---------- */
app.use((req, res, next) => {
  req.io = io;
  next();
});

/* ---------- API routes ---------- */
app.use("/api/webrtc", webrtcRoutes);
app.use(authRoutes);
app.use(connectionRoutes);
app.use(chatRoutes);
app.use(uploadRoutes);

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

/* ---------- Start ---------- */
if (process.env.NODE_ENV === "PROD") {
  server.listen(process.env.PORT || 8080, "0.0.0.0", () => {
    console.log(`[Server] Running on port ${process.env.PORT || 8080}`);
  });
} else {
  server.listen(PORT, () => {
    console.log(`[Server] Running on http://127.0.0.1:${PORT}`);
  });
}
