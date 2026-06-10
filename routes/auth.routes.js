import express from "express";
import {
  register,
  login,
  me,
  updateProfile,
  changePassword,
  linkTelegram,
  toggleNotifications,
  uploadLogPhoto,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { redis } from "../lib/redis.js";


const router = express.Router();

/* --- Public --- */
router.post("/auth/register", register);
router.post("/auth/login", login);

/* --- Protected --- */
router.get("/auth/me", protect, me);
router.put("/auth/profile", protect, updateProfile);
router.post("/auth/profile/logs", protect, uploadLogPhoto);
router.put("/auth/password", protect, changePassword);
router.post("/auth/telegram/link", protect, linkTelegram);
router.post("/auth/notifications/toggle", protect, toggleNotifications);

router.post("/auth/flush-redis", async (req, res) => {
  try {
    await redis.flushall(); // Clear all Redis databases

    return res.status(200).json({
      success: true,
      message: "Redis cache cleared successfully"
    });
  } catch (error) {
    console.error("Redis flush error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to clear Redis cache",
      error: error.message
    });
  }
});

export default router;
