import mongoose from "mongoose";

const customGifSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
    },
    keyVersion: {
      type: String,
      default: null,
    }
  },
  { timestamps: true }
);

// Compound index to quickly fetch a user's custom gifs in a section
customGifSchema.index({ user: 1, section: 1 });

export const CustomGif = mongoose.model("CustomGif", customGifSchema);
