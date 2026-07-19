const mongoose = require("mongoose");

const aiUsageLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    feature: {
      type: String,
      required: true,
      enum: [
        "resume-analysis",
        "interview-question",
        "interview-question-selection",
        "interview-scoring",
        "github-repo-analysis",
        "skill-gap-matching",
        "learning-roadmap-generation",
        "quiz-generation",
        "dashboard-insights",
        "general",
      ],
    },
    model: {
      type: String,
      required: true,
    },
    success: {
      type: Boolean,
      required: true,
    },
    errorType: {
      type: String,
      default: null,
    },
    tokensEstimate: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

aiUsageLogSchema.index({ userId: 1, createdAt: -1 });
aiUsageLogSchema.index({ feature: 1, createdAt: -1 });
aiUsageLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AIUsageLog", aiUsageLogSchema);
