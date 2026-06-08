import mongoose from "mongoose";

/**
 * Connection — represents a friend request / chat connection between two users.
 *
 * Status flow:
 *   pending  → accepted   (receiver accepts)
 *   pending  → rejected   (receiver rejects)
 *   accepted → blocked    (either side blocks)
 */
const connectionSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked"],
      default: "pending",
      index: true,
    },

    // Who initiated the block (if status = blocked)
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent duplicate requests between the same two users
connectionSchema.index({ sender: 1, receiver: 1 }, { unique: true });

// Fast lookup: "give me all connections where I am involved"
connectionSchema.index({ receiver: 1, status: 1 });
connectionSchema.index({ sender: 1, status: 1 });

export const Connection = mongoose.model("Connection", connectionSchema);
