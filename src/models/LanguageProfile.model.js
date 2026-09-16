const mongoose = require("mongoose");

const languageProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    activeLanguage: {
      type: String,
      enum: ["French", "German", "Japanese", "Spanish", "English"],
      default: "Japanese",
    },
    targetExam: {
      type: String,
      default: "N5",
    },
    fluencyLevel: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Beginner",
    },
    preferences: {
      dailyGoalMinutes: { type: Number, default: 30 },
      focusAreas: [{ type: String }], // e.g. "Vocabulary", "Kanji", "Grammar"
    },
    stats: {
      quizzesTaken: { type: Number, default: 0 },
      materialsUploaded: { type: Number, default: 0 },
      chatMessages: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LanguageProfile", languageProfileSchema);
