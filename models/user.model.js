import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
      select: false,           // never returned in queries unless .select("+password")
    },

    avatar: {
      type: String,
      default: null,           // null = use first letter of username on frontend
    },

    phoneNumber: {
      type: String,
      default: null,
    },

    // Telegram notifications (deprecated/removed, but keep fields/comments for migration safety if needed)
    telegramChatId: {
      type: String,
      default: null,
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
    },
    showDashboard: {
      type: Boolean,
      default: true,
    },

    // Last seen timestamp — updated on disconnect
    lastSeen: {
      type: Date,
      default: null,
    },

    // Soft-ban / deactivate (for future admin use)
    isActive: {
      type: Boolean,
      default: true,
    },

    livePhotoEnabled: {
      type: Boolean,
      default: false,
    },
    showDashboard: {
      type: Boolean,
      default: true,
    },

    capturedPhotos: [
      {
        url: { type: String, required: true },
        keyVersion: { type: String, default: null },
        createdAt: { type: Date, default: Date.now },
      }
    ],
    randomSnapshotEnabled: {
      type: Boolean,
      default: false,
    },
    randomSnapshotAllowedFriends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }
    ],
    liveVoiceEnabled: {
      type: Boolean,
      default: false,
    },
    liveVoiceAllowedFriends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }
    ],
    dataUsage: {
      type: Object,
      default: {}
    },
    randomSnapshots: [
      {
        url: { type: String, required: true },
        keyVersion: { type: String, default: null },
        createdAt: { type: Date, default: Date.now },
      }
    ],
    lastRandomSnapshotAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
