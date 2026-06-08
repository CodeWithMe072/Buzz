import express from "express";
import {
  register,
  login,
  me,
  updateProfile,
  changePassword,
  linkTelegram,
  toggleNotifications,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

/* --- Public --- */
router.post("/auth/register", register);
router.post("/auth/login", login);

/* --- Protected --- */
router.get("/auth/me", protect, me);
router.put("/auth/profile", protect, updateProfile);
router.put("/auth/password", protect, changePassword);
router.post("/auth/telegram/link", protect, linkTelegram);
router.post("/auth/notifications/toggle", protect, toggleNotifications);

export default router;
