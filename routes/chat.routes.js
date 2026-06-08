import express from "express";
import { getMessages, deleteChat, getMedia } from "../controllers/chat.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.post("/api/messages", getMessages);
router.delete("/api/chat/:userId", deleteChat);
router.get("/api/chat/:userId/media", getMedia);

export default router;
