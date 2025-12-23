import express from "express";
import { getallMessage,deleteChat } from "../controller/chat.controller.js";

const router = express.Router();

router.post("/allmessages", getallMessage);
router.post("/api/deletechat", deleteChat);

export default router;
