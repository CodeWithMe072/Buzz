import mongoose from "mongoose";

const songRequestSchema = new mongoose.Schema({
  videoId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  channelTitle: { type: String },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed"],
    default: "pending",
    index: true
  },
  failureReason: { type: String },
  requestedAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
});

const SongRequest = mongoose.model("SongRequest", songRequestSchema);
export default SongRequest;
