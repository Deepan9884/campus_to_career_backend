const mongoose = require("mongoose");

const roleSkillSchema = new mongoose.Schema(
  {
    targetRole: {
      type: String,
      required: [true, "Target role is required"],
      trim: true,
      index: true,
    },
    skillName: {
      type: String,
      required: [true, "Skill name is required"],
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },
    importance: {
      type: String,
      required: [true, "Importance is required"],
      enum: {
        values: ["core", "nice-to-have"],
        message: "Importance must be core or nice-to-have",
      },
    },
  },
  {
    timestamps: true,
  },
);

roleSkillSchema.index({ targetRole: 1, skillName: 1 }, { unique: true });

module.exports = mongoose.model("RoleSkill", roleSkillSchema);
