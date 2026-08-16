import express from "express";
import { getMessages, deleteChat, clearChat, getMedia, getLinks, getTrendingGifs, searchGifs, deleteMessage } from "../controllers/chat.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.post("/api/messages", getMessages);

router.delete("/api/chat/:userId", deleteChat);
router.post("/api/chat/:userId/clear", clearChat);
router.get("/api/chat/:userId/media", getMedia);
router.get("/api/chat/:userId/links", getLinks);

router.delete("/api/message/:messageId", deleteMessage);

router.get("/api/gifs/trending", getTrendingGifs);
router.get("/api/gifs/search", searchGifs);

export default router;
