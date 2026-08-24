const mongoose = require("mongoose");

const questionScoreSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    questionTitle: { type: String, default: "" },
    type: { type: String, enum: ["mcq", "coding"], required: true },
    userAnswer: { type: String, default: "" },
    selectedOptionIndex: { type: Number, default: -1 },
    correctOptionIndex: { type: Number, default: -1 },
    isCorrect: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    maxMarks: { type: Number, default: 1 },
    testCasesPassed: { type: Number, default: 0 },
    totalTestCases: { type: Number, default: 0 },
    executionTimeMs: { type: Number, default: 0 },
    feedback: { type: String, default: "" },
  },
  { _id: false }
);

const sectionScoreSchema = new mongoose.Schema(
  {
    sectionId: { type: String, required: true },
    sectionTitle: { type: String, default: "" },
    type: { type: String, enum: ["mcq", "coding"], required: true },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
  },
  { _id: false }
);

const examSubmissionSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentName: {
      type: String,
      required: true,
    },
    registerNumber: {
      type: String,
      default: "N/A",
    },
    studentEmail: {
      type: String,
      required: true,
    },
    studentAvatar: {
      type: String,
      default: "",
    },
    sectionScores: {
      type: [sectionScoreSchema],
      default: [],
    },
    questionScores: {
      type: [questionScoreSchema],
      default: [],
    },
    totalScore: {
      type: Number,
      required: true,
      default: 0,
    },
    maxScore: {
      type: Number,
      required: true,
      default: 100,
    },
    percentage: {
      type: Number,
      required: true,
      default: 0,
    },
    passed: {
      type: Boolean,
      default: false,
    },
    rank: {
      type: Number,
      default: 1,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    proctoringIntegrity: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    violationsCount: {
      type: Number,
      default: 0,
    },
    violationDetails: {
      type: [String],
      default: [],
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    blockedReason: {
      type: String,
      default: "",
    },
    blockedAt: {
      type: Date,
    },
    unblockedAt: {
      type: Date,
    },
    unblockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["submitted", "evaluated", "disqualified", "blocked", "in_progress"],
      default: "submitted",
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

examSubmissionSchema.index({ examId: 1, userId: 1 }, { unique: true });
examSubmissionSchema.index({ examId: 1, totalScore: -1 });

module.exports = mongoose.model("ExamSubmission", examSubmissionSchema);
