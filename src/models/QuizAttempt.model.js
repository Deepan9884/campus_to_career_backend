const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true, trim: true },
    questionText: { type: String, required: true },
    keyPoints: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => arr.length >= 1,
        message: "At least one key point required per question",
      },
    },
  },
  { _id: false },
);

const userAnswerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true, trim: true },
    answerText: { type: String, required: true },
    score: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    feedback: { type: String, default: "" },
  },
  { _id: false },
);

const quizAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    roadmapItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearningRoadmap",
      required: [true, "Roadmap item ID is required"],
    },
    skillName: {
      type: String,
      required: [true, "Skill name is required"],
      trim: true,
    },
    subTopicId: {
      type: String,
      required: [true, "Sub-topic ID is required"],
      trim: true,
      index: true,
    },
    questions: {
      type: [questionSchema],
      required: true,
      validate: {
        validator: (arr) => arr.length >= 3 && arr.length <= 5,
        message: "Quiz must have 3-5 questions",
      },
    },
    userAnswers: {
      type: [userAnswerSchema],
      default: [],
    },
    score: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    passed: {
      type: Boolean,
      default: false,
    },
    attemptedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

quizAttemptSchema.index({ userId: 1, subTopicId: 1 });

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);