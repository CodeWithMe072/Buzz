import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";
import "dotenv/config";

import { connectMongo } from "./config/mongo.js";
import uploadRoutes from "./routes/upload.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import initSocket from "./sockets/chat.sockets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5500;

/* ---------- Mongo ---------- */
await connectMongo();

/* ---------- Express ---------- */
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/* ---------- Routes ---------- */
app.get("/", (req, res) => res.render("index"));
app.use(chatRoutes);
app.use(uploadRoutes);

/* ---------- Server ---------- */
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ---------- Socket ---------- */
initSocket(io);

/* ---------- Start ---------- */
server.listen(PORT, () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});
