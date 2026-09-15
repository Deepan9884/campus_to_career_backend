const mongoose = require("mongoose");

// Saved reusable student group ("batch") owned by a mentor/admin.
// Exams snapshot member IDs at publish time; editing a batch later does not
// retroactively change already-published exams.
const batchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Batch name is required"],
      trim: true,
      maxlength: [80, "Batch name cannot exceed 80 characters"],
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [300, "Description cannot exceed 300 characters"],
    },
    studentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
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

// One batch name per owner — prevents accidental duplicates.
batchSchema.index({ createdBy: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Batch", batchSchema);
