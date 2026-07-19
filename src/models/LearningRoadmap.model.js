const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    platform: { type: String, required: true },
    type: {
      type: String,
      enum: ["course", "docs", "video", "article"],
      required: true,
    },
    url: { type: String, required: true },
  },
  { _id: false },
);

const subTopicSchema = new mongoose.Schema(
  {
    subTopicId: { type: String, required: true, trim: true },
    skillName: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    weightPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "passed"],
      default: "not_started",
    },
  },
  { _id: false },
);

const milestoneSchema = new mongoose.Schema(
  {
    skillName: { type: String, required: true },
    subTopicId: { type: String, required: true },
    importance: {
      type: String,
      enum: ["core", "nice-to-have"],
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["basic", "beginner", "intermediate", "advanced"],
      required: true,
    },
    estimatedTimeframe: { type: String, required: true },
    resources: { type: [resourceSchema], default: [] },
  },
  { _id: true },
);

const learningRoadmapSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    targetRole: {
      type: String,
      required: [true, "Target role is required"],
      trim: true,
    },
    basedOnGapAnalysis: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SkillGapAnalysis",
      required: [true, "Gap analysis reference is required"],
    },
    subTopics: {
      type: [subTopicSchema],
      default: [],
    },
    milestones: {
      type: [milestoneSchema],
      default: [],
    },
    overallSummary: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["completed", "failed"],
      default: "completed",
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

learningRoadmapSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("LearningRoadmap", learningRoadmapSchema);