import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  createStatus,
  getStatusFeed,
  getMyStatuses,
  markStatusViewed,
  deleteStatus
} from "../controllers/status.controller.js";

const router = express.Router();

router.use(protect);

router.post("/api/status", createStatus);
router.get("/api/status/feed", getStatusFeed);
router.get("/api/status/me", getMyStatuses);
router.post("/api/status/:id/view", markStatusViewed);
router.delete("/api/status/:id", deleteStatus);

export default router;
