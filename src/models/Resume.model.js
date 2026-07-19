const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    extractedText: {
      type: String,
      required: true,
    },
    atsScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    keywordBreakdown: {
      matched: [String],
      missing: [String],
    },
    strengths: [String],
    improvements: [String],
    summary: String,
    targetRole: {
      type: String,
      default: null,
    },
    inferredTargetRole: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Resume", resumeSchema);
