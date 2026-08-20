const mongoose = require("mongoose");

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, default: "" },
    expectedOutput: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true, trim: true },
    section: { type: Number, default: 1 }, // 1: Foundational MCQ, 2: Coding, 3: Tough MCQ
    sectionTitle: { type: String, default: "Section 1: Conceptual MCQs" },
    type: { type: String, enum: ["mcq", "coding", "scenario"], default: "mcq" },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    questionText: { type: String, required: true },
    options: { type: [String], default: [] }, // Array of 4 options for MCQs
    correctAnswer: { type: String, default: "" }, // Correct option reference (e.g. "A" or option text)
    explanation: { type: String, default: "" },
    keyPoints: {
      type: [String],
      required: true,
      default: ["Correct understanding and implementation"],
    },
    testCases: { type: [testCaseSchema], default: [] },
    starterCode: { type: String, default: "" },
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
        validator: (arr) => arr.length >= 1 && arr.length <= 20,
        message: "Quiz must have 1-20 questions",
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