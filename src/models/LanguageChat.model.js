const mongoose = require("mongoose");

const languageChatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    language: {
      type: String,
      required: true,
    },
    messages: [
      {
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      }
    ],
    activeMaterials: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StudyMaterial",
      }
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("LanguageChat", languageChatSchema);
