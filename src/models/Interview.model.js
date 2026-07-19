const mongoose = require("mongoose");

const questionSubSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      default: null,
    },
    questionText: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      default: null,
    },
    answeredAt: {
      type: Date,
      default: null,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    feedback: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const interviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    domain: {
      type: String,
      enum: ["behavioral", "technical"],
      required: [true, "Domain is required"],
    },
    targetRole: {
      type: String,
      default: null,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: null,
    },
    questions: {
      type: [questionSubSchema],
      default: [],
    },
    overallScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    strengths: {
      type: [String],
      default: null,
    },
    improvements: {
      type: [String],
      default: null,
    },
    summary: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["in-progress", "completed", "failed"],
      default: "in-progress",
    },
    errorMessage: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

interviewSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Interview", interviewSchema);
