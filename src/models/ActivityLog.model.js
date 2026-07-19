const mongoose = require("mongoose");

const VALID_MODULES = [
  "resume",
  "interview",
  "github",
  "skill_gap",
  "roadmap",
  "quiz",
];

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    module: {
      type: String,
      enum: VALID_MODULES,
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    relatedResourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    relatedResourceType: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ user: 1, module: 1, createdAt: -1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
module.exports.VALID_MODULES = VALID_MODULES;