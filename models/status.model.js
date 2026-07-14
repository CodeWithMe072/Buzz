import mongoose from "mongoose";

const statusSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ["image", "video", "text"],
    required: true
  },
  mediaUrl: {
    type: String,
    default: null
  },
  thumbnailUrl: {
    type: String,
    default: null
  },
  textContent: {
    type: String,
    default: null
  },
  backgroundColor: {
    type: String,
    default: null
  },
  font: {
    type: String,
    default: null
  },
  caption: {
    type: String,
    default: null
  },
  duration: {
    type: Number,
    default: 5
  },
  audience: {
    type: String,
    enum: ["contacts", "exceptContacts", "onlyContacts", "public"],
    default: "contacts"
  },
  audienceList: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  ],
  viewCount: {
    type: Number,
    default: 0
  },
  viewers: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      viewedAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  muted: {
    type: Boolean,
    default: false
  },
  songMergeFailed: {
    type: Boolean,
    default: false
  },
  songRef: {
    youtubeVideoId: { type: String, default: null },
    title: { type: String, default: null },
    channelTitle: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    audioUrl: { type: String, default: null },
    startTime: { type: Number, default: 0 }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL index deletes document automatically at expiresAt
  }
});

const Status = mongoose.model("Status", statusSchema);
export default Status;
