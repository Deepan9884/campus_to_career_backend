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
        "resume_improve_bullet",
        "interview-question",
        "interview-question-selection",
        "interview-scoring",
        "interview-quiz-selection",
        "interview-quiz-scoring",
        "interview-aptitude-selection",
        "interview-aptitude-scoring",
        "interview-core-selection",
        "interview-core-scoring",
        "interview-technical-selection",
        "interview-technical-scoring",
        "interview-hr-selection",
        "interview-hr-scoring",
        "github-repo-analysis",
        "github-linkedin-post",
        "skill-gap-matching",
        "learning-roadmap-generation",
        "quiz-generation",
        "quiz-grading",
        "dashboard-insights",
        "analytics_weekly_report",
        "event_description_generator",
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
