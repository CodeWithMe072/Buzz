import express from "express";
import { getallMessage } from "../controller/chat.controller.js";

const router = express.Router();

router.post("/allmessages", getallMessage);

export default router;
