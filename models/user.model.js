import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    password: {
      type: String,
      required: true,
      select: false
    },

    phoneNumber: {
      type: String,
      default: null
    },

    avatar: {
      type: String,
      default: null
    },
    telegramChatId: {
      type: String,
      default: null
    },
    notificationsEnabled: {
      type: Boolean,
      default: true
    },
    // ONE client id per user, globally unique
    extra: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      index: true
    },

    lastSeen: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
