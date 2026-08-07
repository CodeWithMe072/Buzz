import express from "express";
import {
  register,
  login,
  logout,
  refresh,
  me,
  updateProfile,
  changePassword,
  toggleNotifications,
  uploadLogPhoto,
  uploadMomentPhoto,
  getSecurityLogs,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { authRateLimiter, refreshRateLimiter, uploadRateLimiter } from "../middleware/security.middleware.js";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const router = express.Router();

/* --- Public --- */
// router.post("/auth/register", authRateLimiter, register);
// router.post("/auth/login", authRateLimiter, login);
router.post("/auth/register" , register);
router.post("/auth/login", login);
router.post("/auth/logout", logout);
router.post("/auth/refresh", refreshRateLimiter, refresh);

/* --- Protected --- */
router.get("/auth/me", protect, me);
router.put("/auth/profile", protect, updateProfile);
router.get("/auth/profile/logs", protect, getSecurityLogs);
router.post("/auth/profile/logs", protect, uploadRateLimiter, upload.single("image"), uploadLogPhoto);
router.post(["/auth/profile/moments", "/api/auth/profile/moments"], protect, uploadRateLimiter, upload.single("image"), uploadMomentPhoto);
router.put("/auth/password", protect, changePassword);
router.post("/auth/notifications/toggle", protect, toggleNotifications);

export default router;
