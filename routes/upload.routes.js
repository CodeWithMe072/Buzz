import express from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import fs from "fs";
import path from "path";
import os from "os";
import fse from "fs-extra";

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

const chunkUpload = multer({
  dest: path.join(os.tmpdir(), "chunks"),
  limits: {
    fileSize: 5 * 1024 * 1024
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

router.post(
  "/api/upload-chunk",
  chunkUpload.single("chunk"),
  async (req, res) => {

    try {

      const {
        fileId,
        chunkIndex
      } = req.body;

      if (!req.file) {
        return res
          .status(400)
          .json({
            error: "No chunk uploaded"
          });
      }

      const chunkDir =
        path.join(
          os.tmpdir(),
          "chunks",
          fileId
        );

      await fse.ensureDir(chunkDir);

      const finalChunkPath =
        path.join(
          chunkDir,
          chunkIndex
        );

      await fse.move(
        req.file.path,
        finalChunkPath,
        { overwrite: true }
      );

      return res.json({
        success: true
      });

    } catch (err) {

      console.error(err);

      return res
        .status(500)
        .json({
          error: "Chunk upload failed"
        });
    }
  }
);

router.post(
  "/api/complete-upload",
  express.json(),
  async (req, res) => {

    try {

      const {
        fileId,
        fileName,
        mimeType
      } = req.body;

      const chunkDir =
        path.join(
          os.tmpdir(),
          "chunks",
          fileId
        );

      const mergedPath =
        path.join(
          os.tmpdir(),
          `${Date.now()}_${fileName}`
        );

      const chunkFiles =
        (await fse.readdir(chunkDir))
        .sort((a, b) => Number(a) - Number(b));

      const writeStream =
        fs.createWriteStream(
          mergedPath
        );

      for (const chunkFile of chunkFiles) {

        const chunkPath =
          path.join(
            chunkDir,
            chunkFile
          );

        const chunkBuffer =
          await fse.readFile(chunkPath);

        writeStream.write(chunkBuffer);
      }

      writeStream.end();

      await new Promise((resolve) => {
        writeStream.on("finish", resolve);
      });

      const isVideo =
        mimeType.startsWith("video/");

      const isAudio =
        mimeType.startsWith("audio/");

      const uploadResult =
        await cloudinary.uploader.upload(
          mergedPath,
          {
            folder: "chat_media",
            resource_type:
              (isVideo || isAudio)
                ? "video"
                : "image"
          }
        );

      const publicId =
        uploadResult.public_id;

      const baseUrl =
        uploadResult.secure_url
          .split("/upload/")[0]
          + "/upload";

      // cleanup
      await fse.remove(chunkDir);

      await fse.remove(mergedPath);

      if (isVideo) {

        return res.json({
          type: "video",
          original:
            uploadResult.secure_url,

          cover_270:
            `${baseUrl}/so_0,w_270,h_270,c_fill,f_jpg/${publicId}.jpg`,

          thumb_50:
            `${baseUrl}/so_0,w_50,h_50,c_fill,f_jpg/${publicId}.jpg`
        });
      }

      if (isAudio) {

        return res.json({
          type: "audio",
          original:
            uploadResult.secure_url,

          cover_270: null,
          thumb_50: null
        });
      }

      return res.json({
        type: "image",
        original:
          uploadResult.secure_url,

        cover_270:
          `${baseUrl}/w_270,h_270,c_fill/${publicId}.jpg`,

        thumb_50:
          `${baseUrl}/w_50,h_50,c_fill/${publicId}.jpg`
      });

    } catch (err) {

      console.error(err);

      return res
        .status(500)
        .json({
          error: "Finalize upload failed"
        });
    }
  }
);



export default router;
