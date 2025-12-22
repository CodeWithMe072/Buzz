import express from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "chat_media",
    resource_type: file.mimetype.startsWith("video") ? "video" : "image"
  })
});

const upload = multer({
  storage,
  limits: {
    files: 1,
    fileSize: 50 * 1024 * 1024
  }
});

router.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  res.json({
    url: req.file.path,
    type: req.file.mimetype.split("/")[0]
  });
});

export default router;
