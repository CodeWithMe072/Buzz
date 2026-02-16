import express from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith("video/");
    const isAudio = file.mimetype.startsWith("audio/");

    return {
      folder: "chat_media",
      resource_type: (isVideo || isAudio) ? "video" : "image",
      public_id: `${Date.now()}_${file.originalname.split(".")[0]}`
    };
  }
});



const upload = multer({
  storage,
  limits: {
    files: 1,
    fileSize: 50 * 1024 * 1024
  }
});

router.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const mime = req.file.mimetype;

  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/");
  const publicId = req.file.filename;
  const baseUrl = req.file.path.split("/upload/")[0] + "/upload";
  console.log(req.file.path)
  if (isVideo) {
    return res.status(200).json({
      type: "video",
      original: req.file.path,
      cover_270: `${baseUrl}/so_0,w_270,h_270,c_fill,f_jpg/${publicId}.jpg`,
      thumb_50: `${baseUrl}/so_0,w_50,h_50,c_fill,f_jpg/${publicId}.jpg`
    });
  }

  if (isAudio) {
    return res.status(200).json({
      type: "audio",
      original: req.file.path,
      cover_270: null,
      thumb_50: null
    });
  }

  // image
  return res.status(200).json({
    type: "image",
    original: req.file.path,
    cover_270: `${baseUrl}/w_270,h_270,c_fill/${publicId}.jpg`,
    thumb_50: `${baseUrl}/w_50,h_50,c_fill/${publicId}.jpg`
  });
});



export default router;
