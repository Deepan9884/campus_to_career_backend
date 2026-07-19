const mongoose = require("mongoose");

const gapSubTopicSchema = new mongoose.Schema(
  {
    subTopicId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    weightPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "passed"],
      default: "not_started",
    },
  },
  { _id: false },
);

const gapSchema = new mongoose.Schema(
  {
    skillName: { type: String, required: true },
    importance: {
      type: String,
      enum: ["core", "nice-to-have"],
      required: true,
    },
    subTopics: {
      type: [gapSubTopicSchema],
      default: [],
    },
    gapPercent: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const skillGapAnalysisSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    targetRole: {
      type: String,
      required: [true, "Target role is required"],
      trim: true,
    },
    matchedSkills: {
      type: [String],
      default: [],
    },
    gaps: {
      type: [gapSchema],
      default: [],
    },
    matchPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    recommendations: {
      type: [String],
      default: null,
    },
    status: {
      type: String,
      enum: ["completed", "failed"],
      default: "completed",
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

skillGapAnalysisSchema.virtual("overallGapPercent").get(function () {
  if (!this.gaps || this.gaps.length === 0) return 0;
  const totalWeight = this.gaps.reduce((sum, gap) => {
    const skillWeight = gap.subTopics?.reduce((s, st) => s + (st.weightPercent || 0), 0) || 0;
    return sum + skillWeight;
  }, 0);
  const passedWeight = this.gaps.reduce((sum, gap) => {
    const skillPassedWeight = gap.subTopics
      ?.filter((st) => st.status === "passed")
      .reduce((s, st) => s + (st.weightPercent || 0), 0) || 0;
    return sum + skillPassedWeight;
  }, 0);
  return totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0;
});

skillGapAnalysisSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("SkillGapAnalysis", skillGapAnalysisSchema);