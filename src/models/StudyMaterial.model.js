const mongoose = require("mongoose");

const studyMaterialSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    language: {
      type: String,
      required: true, // e.g. "Japanese"
    },
    originalFileName: {
      type: String,
    },
    fileType: {
      type: String, // e.g. "pdf", "docx", "txt"
    },
    fileUrl: {
      type: String, // If stored in GCS/S3, otherwise just raw text
    },
    parsedText: {
      type: String, // The extracted text content for RAG
      select: false, // Don't fetch by default to save memory
    },
    tokenCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true, // Whether it should be included in the current RAG context
    },
    materialType: {
      type: String,
      enum: ["Textbook", "Vocabulary List", "Grammar Guide", "Previous Year Question Paper", "Other"],
      default: "Other",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudyMaterial", studyMaterialSchema);
