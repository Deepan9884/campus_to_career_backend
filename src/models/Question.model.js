const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    domain: {
      type: String,
      enum: ["behavioral", "technical"],
      required: [true, "Domain is required"],
      index: true,
    },
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

questionSchema.index({ domain: 1, targetRoles: 1 });

module.exports = mongoose.model("Question", questionSchema);
