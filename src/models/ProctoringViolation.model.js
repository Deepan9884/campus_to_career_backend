const mongoose = require("mongoose");

const VIOLATION_TYPES = [
  "mobile_phone_detected",
  "face_not_detected",
  "multiple_faces_detected",
  "fullscreen_exit",
  "fullscreen_timeout",
  "tab_switch",
  "keyboard_shortcut",
  "eye_tracking_violation",
];

const MODULE_TYPES = ["quiz", "interview"];

const violationEventSchema = new mongoose.Schema(
  {
    violationType: {
      type: String,
      enum: VIOLATION_TYPES,
      required: true,
    },
    detectedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const proctoringViolationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    moduleType: {
      type: String,
      enum: MODULE_TYPES,
      required: true,
    },
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    violationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    events: {
      type: [violationEventSchema],
      default: [],
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

proctoringViolationSchema.index({ userId: 1, moduleId: 1 }, { unique: true });

module.exports = mongoose.model("ProctoringViolation", proctoringViolationSchema);
module.exports.VIOLATION_TYPES = VIOLATION_TYPES;
module.exports.MODULE_TYPES = MODULE_TYPES;
