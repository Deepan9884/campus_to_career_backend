const mongoose = require("mongoose");

const languageCertificateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    language: {
      type: String,
      required: true,
      default: "Japanese",
    },
    examLevel: {
      type: String,
      required: true,
      default: "N5",
    },
    certificateTitle: {
      type: String,
      required: true,
      trim: true,
    },
    issuer: {
      type: String,
      default: "Other",
    },
    status: {
      type: String,
      enum: ["Completed", "In Progress", "Planned"],
      default: "Completed",
    },
    score: {
      type: String,
      default: "",
    },
    credentialId: {
      type: String,
      default: "",
    },
    issuedDate: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      default: "",
    },
    originalFileName: {
      type: String,
    },
    fileType: {
      type: String,
    },
    fileUrl: {
      type: String,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("LanguageCertificate", languageCertificateSchema);
