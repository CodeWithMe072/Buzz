import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    /* ---------- Identity ---------- */
    tempId: {
      type: String,
      index: true,
    },

    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* ---------- Content ---------- */
    type: {
      type: String,
      enum: ["text", "image", "video", "audio", "document", "call", "sticker", "gif"],
      required: true,
    },

    content: {
      type: String,
      default: null,           // text OR media URL
    },

    /* ---------- Media Derivatives ---------- */
    cover: {
      type: String,
      default: null,           // 270x270 image preview / video frame
    },

    thumb: {
      type: String,
      default: null,           // 50x50 tiny preview
    },

    caption: {
      type: String,
      default: null,
    },

    replyTo: {
      type: String,            // tempId of replied-to message
      default: null,
    },

    // ── Call message fields ──
    callType: {
      type: String,
      enum: ["audio", "video"],
      default: null,
    },
    callStatus: {
      type: String,
      enum: ["missed", "declined", "ended", "active"],
      default: null,
    },
    callDuration: {
      type: Number,            // seconds
      default: 0,
    },
    callRoomId: {
      type: String,            // unique room ID — receiver uses to rejoin
      default: null,
    },
    callExpiresAt: {
      type: Date,              // 3 mins after call started
      default: null,
    },

    fileName: {
      type: String,
      default: null,
    },

    fileSize: {
      type: String,
      default: null,
    },

    /* ---------- Status ---------- */
    status: {
      sent: { type: Boolean, default: true },
      delivered: { type: Boolean, default: false },
      seen: { type: Boolean, default: false },
      mediaReady: { type: Boolean, default: false },
    },

    /* ---------- Reactions ---------- */
    reactions: {
      type: Map,
      of: String,              // { userId: "👍" }
      default: {},
    },

    /* ---------- Soft Delete ---------- */
    deletedFor: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },

    autoDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* ---------- Timing ---------- */
    clientTime: {
      type: Number,
    },

    deliveredAt: Date,
    seenAt: Date,
  },
  { timestamps: true }
);

/* ---------- Compound indexes ---------- */
messageSchema.index({ from: 1, to: 1, createdAt: -1 });
messageSchema.index({ to: 1, createdAt: -1 });
messageSchema.index({ deletedFor: 1 });

export const Message = mongoose.model("Message", messageSchema);
