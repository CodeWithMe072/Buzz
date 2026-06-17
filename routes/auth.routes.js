import express from "express";
import {
  register,
  login,
  me,
  updateProfile,
  changePassword,
  toggleNotifications,
  uploadLogPhoto,
  uploadMomentPhoto,
  getVapidPublicKey,
  subscribePush,
  unsubscribePush,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { redis } from "../lib/redis.js";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const router = express.Router();

/* --- Public --- */
router.post("/auth/register", register);
router.post("/auth/login", login);

/* --- Protected --- */
router.get("/auth/me", protect, me);
router.put("/auth/profile", protect, updateProfile);
router.post("/auth/profile/logs", protect, upload.single("image"), uploadLogPhoto);
router.post("/auth/profile/moments", protect, upload.single("image"), uploadMomentPhoto);
router.put("/auth/password", protect, changePassword);
router.get("/auth/push/vapid-public-key", protect, getVapidPublicKey);
router.post("/auth/push/subscribe", protect, subscribePush);
router.post("/auth/push/unsubscribe", protect, unsubscribePush);
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
