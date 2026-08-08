const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "resume_analysis_complete",
        "interview_complete",
        "github_analysis_complete",
        "skill_gap_analysis_complete",
        "roadmap_generated",
        "quiz_passed",
        "mentor_note",
        "mentor_assigned",
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedResourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    relatedResourceType: { type: String, default: null },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
