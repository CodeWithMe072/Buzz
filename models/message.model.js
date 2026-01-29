import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    /* ---------- Identity ---------- */
    tempId: {
      type: String,                 // client-generated id
      index: true,
    },

    from: {
      type: String,                 // userId
      required: true,
      index: true,
    },

    to: {
      type: String,                 // userId
      required: true,
      index: true,
    },

    /* ---------- Content ---------- */
    type: {
      type: String,
      enum: ["text", "image", "video"],
      required: true,
    },

    content: {
      type: String,                 // text OR media URL
      required: true,
    },

    /* ---------- Media Derivatives (NEW) ---------- */
    cover: {
      type: String,                 // 270x270 image / video frame
      default: null,
    },

    thumb: {
      type: String,                 // 50x50 image
      default: null,
    },
    caption: {
      type: String,
      default: null,
    },

    replyTo: {
      type: String,                 // tempId
      default: null,
    },

    /* ---------- Status (SERVER CONTROLLED) ---------- */
    status: {
      sent: {
        type: Boolean,
        default: true,
      },
      delivered: {
        type: Boolean,
        default: false,
      },
      seen: {
        type: Boolean,
        default: false,
      },
    },

    /* ---------- Reactions ---------- */
    reactions: {
      type: Map,
      of: String,                   // { userId: "👍" }
      default: {},
    },

    /* ---------- Delete For Me (KEY FEATURE) ---------- */
    deletedFor: {
      type: [String],               // userIds who hid this message
      default: [],
    },

    /* ---------- Timing ---------- */
    clientTime: {
      type: Number,                 // Date.now() from client
    },

    deliveredAt: Date,
    seenAt: Date,
  },
  {
    timestamps: true,               // createdAt, updatedAt
  }
);

/* ---------- Indexes (performance-critical) ---------- */
messageSchema.index({ from: 1, to: 1, createdAt: -1 });
messageSchema.index({ to: 1, createdAt: -1 });
messageSchema.index({ deletedFor: 1 });

export const Message = mongoose.model("Message", messageSchema);
