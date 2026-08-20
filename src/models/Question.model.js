const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    roundType: {
      type: String,
      enum: ["quiz", "aptitude", "core", "technical", "coding", "hr"],
      required: [true, "Round type is required"],
      index: true,
    },
    itemType: {
      type: String,
      enum: ["mcq", "open_ended", "coding"],
      required: [true, "Item type is required"],
    },
    options: {
      type: [String],
      default: undefined, // optional; populated for mcq only
    },
    correctOptionIndex: {
      type: Number,
      default: null, // optional; populated for mcq only
    },
    starterCode: {
      type: String,
      default: "",
    },
    testCases: [
      {
        input: { type: String, default: "" },
        expectedOutput: { type: String, default: "" },
        description: { type: String, default: "" },
      },
    ],

    category: {
      type: String,
    },
    targetRoles: {
      type: [String],
      default: [],
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    questionText: {
      type: String,
      required: [true, "Question text is required"],
    },
    idealAnswerPoints: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

questionSchema.index({ roundType: 1, targetRoles: 1 });

module.exports = mongoose.model("Question", questionSchema);
