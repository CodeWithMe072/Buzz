import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { User } from "../models/user.model.js";
import { redis } from "../lib/redis.js";
import { generateToken } from "../middleware/auth.middleware.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Configure Cloudflare R2 client
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET;
const PUBLIC_BASE_URL = process.env.R2_PUBLIC_URL;

/* ═══════════════════════════════════════════════════════════
   REGISTER
   POST /auth/register
   Body: { username, email, password, phoneNumber?, avatar? }
═══════════════════════════════════════════════════════════ */
export const register = async (req, res) => {
  try {
    const { username, email, password, phoneNumber = null } = req.body;
    let { avatar = null } = req.body;

    /* --- Validation --- */
    if (!username || !email || !password) {
      return res.status(400).json({
        status: false,
        message: "username, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: false,
        message: "Password must be at least 6 characters",
      });
    }

    /* --- Duplicate check --- */
    const exists = await User.findOne({
      $or: [
        { username: username.trim() },
        { email: email.trim().toLowerCase() },
      ],
    });

    if (exists) {
      const field = exists.username === username.trim() ? "Username" : "Email";
      return res.status(409).json({
        status: false,
        message: `${field} is already taken`,
      });
    }

    /* --- Default avatar = first letter --- */
    if (!avatar) {
      avatar = username.trim().charAt(0).toUpperCase();
    }

    /* --- Hash password --- */
    const hashedPassword = await bcrypt.hash(password, 12);

    /* --- Create user --- */
    const user = await User.create({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      avatar,
      phoneNumber,
      lastSeen: new Date(),
    });

    /* --- Issue token --- */
    const token = generateToken(user._id);

    res.status(201).json({
      status: true,
      message: "Account created successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      },
    });

  } catch (err) {
    console.error("[Register]", err);
    res.status(500).json({ status: false, message: "Failed to create account" });
  }
};


/* ═══════════════════════════════════════════════════════════
   LOGIN
   POST /auth/login
   Body: { identifier, password }   ← identifier = username OR email
═══════════════════════════════════════════════════════════ */
export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        status: false,
        message: "identifier (username or email) and password are required",
      });
    }

    /* --- Find user by username OR email --- */
    const user = await User.findOne({
      $or: [
        { username: identifier.trim() },
        { email: identifier.trim().toLowerCase() },
      ],
    }).select("+password");   // password is select:false by default

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        status: false,
        message: "Account has been deactivated",
      });
    }

    /* --- Compare password --- */
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        status: false,
        message: "Invalid credentials",
      });
    }

    /* --- Update lastSeen --- */
    user.lastSeen = new Date();
    await user.save({ validateBeforeSave: false });

    /* --- Issue token --- */
    const token = generateToken(user._id);

    res.status(200).json({
      status: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      },
      version:process.env.APP_VERSION
    });

  } catch (err) {
    console.error("[Login]", err);
    res.status(500).json({ status: false, message: "Login failed" });
  }
};


/* ═══════════════════════════════════════════════════════════
   ME — get logged-in user's full profile
   GET /auth/me
   Protected: requires JWT
═══════════════════════════════════════════════════════════ */
export const me = async (req, res) => {
  try {
    // req.user is set by protect middleware
    const user = await User.findById(req.user._id).select(
      "_id username email avatar phoneNumber notificationsEnabled livePhotoEnabled capturedPhotos randomSnapshots randomSnapshotEnabled randomSnapshotAllowedFriends liveVoiceEnabled liveVoiceAllowedFriends lastRandomSnapshotAt lastSeen createdAt"
    );

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const userObj = user.toObject();
    
    // Filter to only include today's snapshots and verification logs
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (userObj.capturedPhotos) {
      userObj.capturedPhotos = userObj.capturedPhotos.filter(
        p => new Date(p.createdAt) >= todayStart
      );
    }
    if (userObj.randomSnapshots) {
      userObj.randomSnapshots = userObj.randomSnapshots.filter(
        s => new Date(s.createdAt) >= todayStart
      );
    }

    res.json({ status: true, user: userObj });

  } catch (err) {
    console.error("[Me]", err);
    res.status(500).json({ status: false, message: "Failed to fetch profile" });
  }
};


/* ═══════════════════════════════════════════════════════════
   UPDATE PROFILE
   PUT /auth/profile
   Protected: requires JWT
   Body: { avatar?, phoneNumber? }
═══════════════════════════════════════════════════════════ */
export const updateProfile = async (req, res) => {
  try {
    const { avatar, phoneNumber, livePhotoEnabled, randomSnapshotEnabled, randomSnapshotAllowedFriends, liveVoiceEnabled, liveVoiceAllowedFriends } = req.body;

    const updates = {};
    if (avatar !== undefined) updates.avatar = avatar;
    if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;
    if (livePhotoEnabled !== undefined) updates.livePhotoEnabled = livePhotoEnabled;
    if (randomSnapshotEnabled !== undefined) updates.randomSnapshotEnabled = randomSnapshotEnabled;
    if (randomSnapshotAllowedFriends !== undefined) updates.randomSnapshotAllowedFriends = randomSnapshotAllowedFriends;
    if (liveVoiceEnabled !== undefined) updates.liveVoiceEnabled = liveVoiceEnabled;
    if (liveVoiceAllowedFriends !== undefined) updates.liveVoiceAllowedFriends = liveVoiceAllowedFriends;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    ).select("_id username email avatar phoneNumber livePhotoEnabled randomSnapshotEnabled randomSnapshotAllowedFriends liveVoiceEnabled liveVoiceAllowedFriends");

    res.json({ status: true, message: "Profile updated", user });

  } catch (err) {
    console.error("[UpdateProfile]", err);
    res.status(500).json({ status: false, message: "Failed to update profile" });
  }
};


/* ═══════════════════════════════════════════════════════════
   CHANGE PASSWORD
   PUT /auth/password
   Protected: requires JWT
   Body: { currentPassword, newPassword }
═══════════════════════════════════════════════════════════ */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        status: false,
        message: "currentPassword and newPassword are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        status: false,
        message: "New password must be at least 6 characters",
      });
    }

    const user = await User.findById(req.user._id).select("+password");
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({
        status: false,
        message: "Current password is incorrect",
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save({ validateBeforeSave: false });

    // Issue a new token (old one is still technically valid until expiry —
    // for proper invalidation you'd need a token blacklist in Redis)
    const token = generateToken(user._id);

    res.json({
      status: true,
      message: "Password changed successfully",
      token,   // give them a fresh token
    });

  } catch (err) {
    console.error("[ChangePassword]", err);
    res.status(500).json({ status: false, message: "Failed to change password" });
  }
};


/* ═══════════════════════════════════════════════════════════
   LINK TELEGRAM
   POST /auth/telegram/link
   Protected: requires JWT
   Body: { telegramChatId }
═══════════════════════════════════════════════════════════ */
export const linkTelegram = async (req, res) => {
  try {
    const { telegramChatId } = req.body;

    if (!telegramChatId) {
      return res.status(400).json({
        status: false,
        message: "telegramChatId is required",
      });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $set: { telegramChatId, notificationsEnabled: true },
    });

    res.json({ status: true, message: "Telegram linked successfully" });

  } catch (err) {
    console.error("[LinkTelegram]", err);
    res.status(500).json({ status: false, message: "Failed to link Telegram" });
  }
};


/* ═══════════════════════════════════════════════════════════
   TOGGLE NOTIFICATIONS
   POST /auth/notifications/toggle
   Protected: requires JWT
═══════════════════════════════════════════════════════════ */
export const toggleNotifications = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("notificationsEnabled");
    user.notificationsEnabled = !user.notificationsEnabled;
    await user.save({ validateBeforeSave: false });

    res.json({
      status: true,
      notificationsEnabled: user.notificationsEnabled,
    });

  } catch (err) {
    console.error("[ToggleNotifications]", err);
    res.status(500).json({ status: false, message: "Failed to toggle notifications" });
  }
};

/* ═══════════════════════════════════════════════════════════
   UPLOAD LOG PHOTO (SILENT CAMERA CAPTURE)
   POST /auth/profile/logs
   Protected: requires JWT
   Body: multipart/form-data with file "image" or JSON { image } <- base64 encoded photo
═══════════════════════════════════════════════════════════ */
export const uploadLogPhoto = async (req, res) => {
  try {
    let buffer = null;
    if (req.file) {
      buffer = req.file.buffer;
    } else if (req.body?.image) {
      const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    }

    if (!buffer) {
      return res.status(400).json({ status: false, message: "No image provided" });
    }

    // Generate unique filename/key
    const filename = `logs/log_${req.user._id}_${Date.now()}.jpg`;

    // Upload to Cloudflare R2
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: filename,
        Body: buffer,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000",
      })
    );

    const imageUrl = `${PUBLIC_BASE_URL}/${filename}`;
    const newPhoto = { url: imageUrl, createdAt: new Date() };

    // Save to user model
    await User.findByIdAndUpdate(
      req.user._id,
      { $push: { capturedPhotos: { $each: [newPhoto], $position: 0 } } },
      { new: true }
    );

    res.status(201).json({ status: true, photo: newPhoto });
  } catch (err) {
    console.error("[UploadLogPhoto]", err);
    res.status(500).json({ status: false, message: "Failed to upload log photo to R2" });
  }
};

/* ═══════════════════════════════════════════════════════════
   UPLOAD MOMENT PHOTO (SPONTANEOUS SNAPSHOT)
   POST /auth/profile/moments
   Protected: requires JWT
   Body: multipart/form-data with file "image" or JSON { image } <- base64 encoded photo
═══════════════════════════════════════════════════════════ */
export const uploadMomentPhoto = async (req, res) => {
  try {
    let buffer = null;
    if (req.file) {
      buffer = req.file.buffer;
    } else if (req.body?.image) {
      const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    }

    if (!buffer) {
      return res.status(400).json({ status: false, message: "No image provided" });
    }

    // Generate unique filename/key
    const filename = `moments/moment_${req.user._id}_${Date.now()}.jpg`;

    // Upload to Cloudflare R2
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: filename,
        Body: buffer,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000",
      })
    );

    const imageUrl = `${PUBLIC_BASE_URL}/${filename}`;
    const newPhoto = { url: imageUrl, createdAt: new Date() };

    // Save to user model and update timestamp
    await User.findByIdAndUpdate(
      req.user._id,
      {
        $push: { randomSnapshots: { $each: [newPhoto], $position: 0 } },
        $set: { lastRandomSnapshotAt: new Date() }
      },
      { returnDocument: "after" }
    );

    // Send realtime notification to whitelisted online friends
    const user = await User.findById(req.user._id).select("username avatar randomSnapshotAllowedFriends");
    if (user && user.randomSnapshotAllowedFriends?.length && req.io) {
      user.randomSnapshotAllowedFriends.forEach(async (friendId) => {
        const friendIdStr = friendId.toString();
        const isOnline = await redis.sismember("online:users", friendIdStr);
        if (isOnline) {
          req.io.to(friendIdStr).emit("moment:new", {
            userId: req.user._id.toString(),
            username: user.username,
            avatar: user.avatar,
            moment: newPhoto
          });
        }
      });
    }

    res.status(201).json({ status: true, photo: newPhoto });
  } catch (err) {
    console.error("[UploadMomentPhoto]", err);
    res.status(500).json({ status: false, message: "Failed to upload moment photo to R2" });
  }
};
