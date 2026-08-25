const mongoose = require("mongoose");

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, default: "" },
    expectedOutput: { type: String, default: "" },
    description: { type: String, default: "" },
    isHidden: { type: Boolean, default: false },
  },
  { _id: false }
);

const mcqQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    question: { type: String, required: true },
    options: {
      type: [String],
      required: true,
      validate: [
        (val) => val.length >= 2,
        "An MCQ question must have at least 2 options",
      ],
    },
    correctOptionIndex: { type: Number, required: true, default: 0 },
    correctAnswer: { type: String, default: "" },
    positiveMarks: { type: Number, default: 1, min: 0 },
    negativeMarks: { type: Number, default: 0, min: 0 },
    explanation: { type: String, default: "" },
    topic: { type: String, default: "General" },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    imageUrl: { type: String, default: "" },
    diagramUrl: { type: String, default: "" },
  },
  { _id: false }
);

const codingQuestionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", "FAANG Tier"],
      default: "Medium",
    },
    category: { type: String, default: "Algorithms" },
    problemStatement: { type: String, required: true },
    diagramUrl: { type: String, default: "" },
    sourceUrl: { type: String, default: "" }, // LeetCode or HackerRank URL
    inputFormat: { type: String, default: "" },
    outputFormat: { type: String, default: "" },
    constraints: { type: [String], default: [] },
    marks: { type: Number, default: 10, min: 1 },
    starterCodes: {
      type: Map,
      of: String,
      default: {
        python: "# Write your solution here\n",
        javascript: "// Write your solution here\n",
        java: "// Write your solution here\n",
        cpp: "// Write your solution here\n",
      },
    },
    testCases: { type: [testCaseSchema], default: [] },
  },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    sectionId: { type: String, required: true },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ["mcq", "coding"],
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "faang"],
      default: "medium",
    },
    topics: { type: [String], default: [] },
    timeLimitMinutes: { type: Number, default: 30 },
    targetQuestionCount: { type: Number, default: 5 },
    mcqQuestions: { type: [mcqQuestionSchema], default: [] },
    codingQuestions: { type: [codingQuestionSchema], default: [] },
  },
  { _id: false }
);

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Exam title is required"],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    examType: {
      type: String,
      enum: ["mcq", "coding", "mixed"],
      required: [true, "Exam type is required (mcq, coding, or mixed)"],
      index: true,
    },
    category: {
      type: String,
      default: "General Assessment",
      trim: true,
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard", "FAANG Tier", "Mixed"],
      default: "Medium",
    },
    durationMinutes: {
      type: Number,
      required: [true, "Duration in minutes is required"],
      min: [5, "Duration must be at least 5 minutes"],
      max: [300, "Duration cannot exceed 300 minutes"],
      default: 60,
    },
    passingScorePercentage: {
      type: Number,
      default: 60,
      min: 0,
      max: 100,
    },
    totalMarks: {
      type: Number,
      default: 100,
    },
    targetAudience: {
      type: String,
      enum: ["all", "mentees", "selected"],
      default: "all",
      index: true,
    },
    assignedStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    sections: {
      type: [sectionSchema],
      required: true,
      validate: [(val) => val.length >= 1, "At least one section is required"],
    },
    proctoringConfig: {
      webcamRequired: { type: Boolean, default: false },
      fullscreenEnforced: { type: Boolean, default: true },
      tabSwitchLimit: { type: Number, default: 3 },
      aiFaceDetection: { type: Boolean, default: false },
      copyPasteDisabled: { type: Boolean, default: false },
    },
    isResultDisclosed: {
      type: Boolean,
      default: false, // Marks are NOT disclosed to students until admin toggles!
      index: true,
    },
    allowRetakes: {
      type: Boolean,
      default: false, // Strictly NO retakes allowed unless explicitly enabled by admin!
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
    isScheduled: {
      type: Boolean,
      default: false,
      index: true,
    },
    scheduledStartTime: {
      type: Date,
      default: null,
    },
    scheduledEndTime: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "active", "completed", "stopped"],
      default: "active",
      index: true,
    },
    stoppedAt: {
      type: Date,
      default: null,
    },
    stoppedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

examSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Exam", examSchema);
