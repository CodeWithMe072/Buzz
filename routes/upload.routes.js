import express from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "chat_media",
    resource_type: file.mimetype.startsWith("video") ? "video" : "image",
    public_id: `${Date.now()}_${file.originalname.split(".")[0]}`
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
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const isVideo = req.file.mimetype.startsWith("video") ? true : false
  const publicId = req.file.filename; // Cloudinary public_id
  const baseUrl = req.file.path.split("/upload/")[0] + "/upload";
  let response;

  if (isVideo) {
    response = {
      type: "video",
      original: req.file.path,

      cover_270: `${baseUrl}/so_0,w_270,h_270,c_fill,f_jpg/${publicId}.jpg`,
      thumb_50: `${baseUrl}/so_0,w_50,h_50,c_fill,f_jpg/${publicId}.jpg`
    };
  } else {
    response = {
      type: "image",
      original: req.file.path,

      cover_270: `${baseUrl}/w_270,h_270,c_fill/${publicId}.jpg`,
      thumb_50: `${baseUrl}/w_50,h_50,c_fill/${publicId}.jpg`
    };
  }

  res.status(200).json(response);
});


export default router;
