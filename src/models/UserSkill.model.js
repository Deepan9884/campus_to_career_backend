const mongoose = require("mongoose");

const userSkillSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Skill name is required"],
      trim: true,
      maxlength: [60, "Skill name must be at most 60 characters"],
    },
    level: {
      type: String,
      required: [true, "Skill level is required"],
      enum: {
        values: ["beginner", "intermediate", "advanced", "expert"],
        message: "Level must be beginner, intermediate, advanced, or expert",
      },
    },
    source: {
      type: String,
      enum: {
        values: ["self-reported", "resume", "github"],
        message: "Source must be self-reported, resume, or github",
      },
      default: "self-reported",
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

userSkillSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("UserSkill", userSkillSchema);
