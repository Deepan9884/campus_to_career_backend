const mongoose = require("mongoose");

const repoAnalysisSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    repoFullName: {
      type: String,
      required: [true, "Repository full name is required"],
      trim: true,
    },
    repoUrl: {
      type: String,
      required: [true, "Repository URL is required"],
    },
    overview: {
      type: String,
      default: null,
    },
    quality: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    security: {
      type: String,
      default: null,
    },
    resumeImpact: {
      type: [String],
      default: null,
    },
    filesAnalyzed: {
      type: [String],
      default: [],
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

repoAnalysisSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("RepoAnalysis", repoAnalysisSchema);
