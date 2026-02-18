import express from "express";
import { getallMessage,deleteChat,getmedia } from "../controller/chat.controller.js";

const router = express.Router();

router.get("/api/chats/media/:chat_key", getmedia);
router.post("/allmessages", getallMessage);
router.post("/api/deletechat", deleteChat);

export default router;
