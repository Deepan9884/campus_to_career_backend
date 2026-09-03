const mongoose = require("mongoose");

// Cost per 1M tokens for different models (as of 2024)
const MODEL_COSTS = {
  "gemini-1.5-pro": { input: 1.25, output: 5.0 }, // $ per 1M tokens
  "gemini-1.5-flash": { input: 0.075, output: 0.30 },
  "gemini-1.5-flash-8b": { input: 0.0375, output: 0.15 },
  "gemini-2.0-flash-exp": { input: 0.0, output: 0.0 }, // Free tier
  "contextual-smart-engine": { input: 0.0, output: 0.0 }, // Fallback
  "smart-fallback": { input: 0.0, output: 0.0 },
  default: { input: 1.0, output: 4.0 }, // Default conservative estimate
};

const aiUsageLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    feature: {
      type: String,
      required: true,
      enum: [
        "resume-analysis",
        "resume_improve_bullet",
        "interview-question",
        "interview-question-selection",
        "interview-scoring",
        "interview-quiz-selection",
        "interview-quiz-scoring",
        "interview-aptitude-selection",
        "interview-aptitude-scoring",
        "interview-core-selection",
        "interview-core-scoring",
        "interview-technical-selection",
        "interview-technical-scoring",
        "interview-hr-selection",
        "interview-hr-scoring",
        "github-repo-analysis",
        "github-linkedin-post",
        "skill-gap-matching",
        "learning-roadmap-generation",
        "quiz-generation",
        "quiz-grading",
        "dashboard-insights",
        "analytics_weekly_report",
        "event_description_generator",
        "general",
      ],
    },
    model: {
      type: String,
      required: true,
    },
    success: {
      type: Boolean,
      required: true,
    },
    errorType: {
      type: String,
      default: null,
    },
    tokensEstimate: {
      type: Number,
      default: null,
    },
    // Enhanced cost tracking fields
    inputTokens: {
      type: Number,
      default: 0,
    },
    outputTokens: {
      type: Number,
      default: 0,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },
    estimatedCost: {
      type: Number, // Cost in USD
      default: 0,
    },
    actualCost: {
      type: Number, // Actual cost if available from provider
      default: null,
    },
    cached: {
      type: Boolean,
      default: false,
    },
    isFallback: {
      type: Boolean,
      default: false,
    },
    responseTime: {
      type: Number, // Response time in milliseconds
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

aiUsageLogSchema.index({ userId: 1, createdAt: -1 });
aiUsageLogSchema.index({ feature: 1, createdAt: -1 });
aiUsageLogSchema.index({ createdAt: -1 });
aiUsageLogSchema.index({ model: 1, createdAt: -1 });
aiUsageLogSchema.index({ estimatedCost: 1 });

// Calculate estimated cost based on tokens and model
aiUsageLogSchema.pre("save", function (next) {
  if (this.isNew && !this.estimatedCost && (this.inputTokens || this.outputTokens)) {
    const costs = MODEL_COSTS[this.model] || MODEL_COSTS.default;
    
    const inputCost = (this.inputTokens / 1000000) * costs.input;
    const outputCost = (this.outputTokens / 1000000) * costs.output;
    
    this.estimatedCost = inputCost + outputCost;
  }
  
  // Calculate total tokens if not set
  if (!this.totalTokens && (this.inputTokens || this.outputTokens)) {
    this.totalTokens = (this.inputTokens || 0) + (this.outputTokens || 0);
  }
  
  next();
});

// Static method: Get total cost for a user in a date range
aiUsageLogSchema.statics.getTotalCostByUser = async function (userId, startDate, endDate) {
  const result = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate, $lte: endDate },
        success: true,
      },
    },
    {
      $group: {
        _id: null,
        totalCost: { $sum: "$estimatedCost" },
        totalTokens: { $sum: "$totalTokens" },
        requestCount: { $sum: 1 },
      },
    },
  ]);
  
  return result[0] || { totalCost: 0, totalTokens: 0, requestCount: 0 };
};

// Static method: Get cost breakdown by feature
aiUsageLogSchema.statics.getCostByFeature = async function (startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        success: true,
      },
    },
    {
      $group: {
        _id: "$feature",
        totalCost: { $sum: "$estimatedCost" },
        totalTokens: { $sum: "$totalTokens" },
        requestCount: { $sum: 1 },
        avgCost: { $avg: "$estimatedCost" },
      },
    },
    {
      $sort: { totalCost: -1 },
    },
  ]);
};

// Static method: Get cost breakdown by model
aiUsageLogSchema.statics.getCostByModel = async function (startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        success: true,
      },
    },
    {
      $group: {
        _id: "$model",
        totalCost: { $sum: "$estimatedCost" },
        totalTokens: { $sum: "$totalTokens" },
        requestCount: { $sum: 1 },
        avgResponseTime: { $avg: "$responseTime" },
      },
    },
    {
      $sort: { totalCost: -1 },
    },
  ]);
};

// Static method: Get daily cost trend
aiUsageLogSchema.statics.getDailyCostTrend = async function (days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        success: true,
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        totalCost: { $sum: "$estimatedCost" },
        totalTokens: { $sum: "$totalTokens" },
        requestCount: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);
};

// Static method: Get top spenders
aiUsageLogSchema.statics.getTopSpenders = async function (limit = 10, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        success: true,
      },
    },
    {
      $group: {
        _id: "$userId",
        totalCost: { $sum: "$estimatedCost" },
        totalTokens: { $sum: "$totalTokens" },
        requestCount: { $sum: 1 },
      },
    },
    {
      $sort: { totalCost: -1 },
    },
    {
      $limit: limit,
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: "$user",
    },
    {
      $project: {
        userId: "$_id",
        email: "$user.email",
        name: "$user.name",
        totalCost: 1,
        totalTokens: 1,
        requestCount: 1,
      },
    },
  ]);
};

module.exports = mongoose.model("AIUsageLog", aiUsageLogSchema);
module.exports.MODEL_COSTS = MODEL_COSTS;
