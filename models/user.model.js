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

    // Telegram notifications
    telegramChatId: {
      type: String,
      default: null,
    },
    notificationsEnabled: {
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
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
