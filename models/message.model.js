import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    /* ---------- Identity ---------- */
    tempId: {
      type: String,          // client-generated id
      index: true,
    },

    from: {
      type: String,          // userId / username
      required: true,
      index: true,
    },

    to: {
      type: String,          // userId / username
      required: true,
      index: true,
    },

    /* ---------- Content ---------- */
    type: {
      type: String,
      enum: ["text", "image", "file"],
      required: true,
    },

    content: {
      type: String,          // text OR file URL
      required: true,
    },

    caption: {
      type: String,
      default: null,
    },

    replyTo: {
      type: String,   // ✅ tempId
      default: null
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
      of: String,            // { userId: "👍" }
      default: {},
    },

    /* ---------- Timing ---------- */
    clientTime: {
      type: Number,          // Date.now() from client
    },

    deliveredAt: Date,
    seenAt: Date,
  },
  {
    timestamps: true,        // createdAt, updatedAt
  }
);

/* ---------- Indexes (important for performance) ---------- */
messageSchema.index({ from: 1, to: 1, createdAt: -1 });
messageSchema.index({ to: 1, createdAt: -1 });

export const Message = mongoose.model("Message", messageSchema);
