const AIUsageLog = require("../models/AIUsageLog.model");
const { MODEL_COSTS } = require("../models/AIUsageLog.model");

/**
 * Calculate cost for a given number of tokens
 * @param {string} model - Model name
 * @param {number} inputTokens - Input tokens
 * @param {number} outputTokens - Output tokens
 * @returns {number} - Cost in USD
 */
function calculateCost(model, inputTokens = 0, outputTokens = 0) {
  const costs = MODEL_COSTS[model] || MODEL_COSTS.default;
  
  const inputCost = (inputTokens / 1000000) * costs.input;
  const outputCost = (outputTokens / 1000000) * costs.output;
  
  return inputCost + outputCost;
}

/**
 * Log AI usage with cost tracking
 * @param {Object} params - Usage parameters
 * @returns {Promise<Object>}
 */
async function logAIUsage({
  userId,
  feature,
  model,
  success,
  errorType = null,
  inputTokens = 0,
  outputTokens = 0,
  tokensEstimate = null,
  cached = false,
  isFallback = false,
  responseTime = null,
}) {
  try {
    const totalTokens = inputTokens + outputTokens;
    const estimatedCost = calculateCost(model, inputTokens, outputTokens);

    const log = await AIUsageLog.create({
      userId,
      feature,
      model,
      success,
      errorType,
      inputTokens,
      outputTokens,
      totalTokens,
      tokensEstimate: tokensEstimate || totalTokens,
      estimatedCost: cached ? 0 : estimatedCost, // No cost for cached responses
      cached,
      isFallback,
      responseTime,
    });

    return log;
  } catch (err) {
    console.error("[AI Cost Tracking] Failed to log usage:", err.message);
    return null;
  }
}

/**
 * Get user's AI usage summary for a period
 * @param {string} userId
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<Object>}
 */
async function getUserUsageSummary(userId, startDate, endDate) {
  const summary = await AIUsageLog.getTotalCostByUser(userId, startDate, endDate);
  
  // Get breakdown by feature
  const byFeature = await AIUsageLog.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate, $lte: endDate },
        success: true,
      },
    },
    {
      $group: {
        _id: "$feature",
        cost: { $sum: "$estimatedCost" },
        tokens: { $sum: "$totalTokens" },
        requests: { $sum: 1 },
      },
    },
    {
      $sort: { cost: -1 },
    },
  ]);

  return {
    ...summary,
    byFeature,
  };
}

/**
 * Check if user is within budget limits
 * @param {string} userId
 * @param {number} dailyBudget - Daily budget in USD
 * @param {number} monthlyBudget - Monthly budget in USD
 * @returns {Promise<Object>}
 */
async function checkBudget(userId, dailyBudget = 5.0, monthlyBudget = 100.0) {
  const now = new Date();
  
  // Check daily budget
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const dailyUsage = await AIUsageLog.getTotalCostByUser(userId, todayStart, todayEnd);
  
  // Check monthly budget
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const monthlyUsage = await AIUsageLog.getTotalCostByUser(userId, monthStart, monthEnd);
  
  const dailyExceeded = dailyUsage.totalCost >= dailyBudget;
  const monthlyExceeded = monthlyUsage.totalCost >= monthlyBudget;
  
  return {
    daily: {
      used: dailyUsage.totalCost,
      limit: dailyBudget,
      remaining: Math.max(0, dailyBudget - dailyUsage.totalCost),
      exceeded: dailyExceeded,
      percentage: (dailyUsage.totalCost / dailyBudget) * 100,
    },
    monthly: {
      used: monthlyUsage.totalCost,
      limit: monthlyBudget,
      remaining: Math.max(0, monthlyBudget - monthlyUsage.totalCost),
      exceeded: monthlyExceeded,
      percentage: (monthlyUsage.totalCost / monthlyBudget) * 100,
    },
    withinBudget: !dailyExceeded && !monthlyExceeded,
  };
}

/**
 * Get platform-wide cost analytics
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>}
 */
async function getPlatformAnalytics(days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const endDate = new Date();
  
  const [costByFeature, costByModel, dailyTrend, topSpenders] = await Promise.all([
    AIUsageLog.getCostByFeature(startDate, endDate),
    AIUsageLog.getCostByModel(startDate, endDate),
    AIUsageLog.getDailyCostTrend(days),
    AIUsageLog.getTopSpenders(10, days),
  ]);
  
  // Calculate total cost
  const totalCost = costByFeature.reduce((sum, item) => sum + item.totalCost, 0);
  const totalTokens = costByFeature.reduce((sum, item) => sum + item.totalTokens, 0);
  const totalRequests = costByFeature.reduce((sum, item) => sum + item.requestCount, 0);
  
  return {
    summary: {
      totalCost,
      totalTokens,
      totalRequests,
      avgCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
      period: { days, startDate, endDate },
    },
    costByFeature,
    costByModel,
    dailyTrend,
    topSpenders,
  };
}

/**
 * Estimate cost for a prompt before sending to AI
 * @param {string} prompt
 * @param {string} model
 * @param {number} estimatedOutputTokens
 * @returns {Object}
 */
function estimatePromptCost(prompt, model, estimatedOutputTokens = 1000) {
  // Rough estimate: 1 token ≈ 4 characters
  const estimatedInputTokens = Math.ceil(prompt.length / 4);
  const cost = calculateCost(model, estimatedInputTokens, estimatedOutputTokens);
  
  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    totalTokens: estimatedInputTokens + estimatedOutputTokens,
    estimatedCost: cost,
    model,
  };
}

/**
 * Get cost efficiency metrics
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<Object>}
 */
async function getCostEfficiencyMetrics(startDate, endDate) {
  const metrics = await AIUsageLog.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        success: true,
      },
    },
    {
      $group: {
        _id: null,
        totalCost: { $sum: "$estimatedCost" },
        cachedRequests: {
          $sum: { $cond: ["$cached", 1, 0] },
        },
        fallbackRequests: {
          $sum: { $cond: ["$isFallback", 1, 0] },
        },
        totalRequests: { $sum: 1 },
        avgResponseTime: { $avg: "$responseTime" },
        costSavedByCache: {
          $sum: {
            $cond: ["$cached", { $multiply: ["$estimatedCost", 10] }, 0],
          }, // Assume cache saves 10x cost
        },
      },
    },
  ]);
  
  const result = metrics[0] || {
    totalCost: 0,
    cachedRequests: 0,
    fallbackRequests: 0,
    totalRequests: 0,
    avgResponseTime: 0,
    costSavedByCache: 0,
  };
  
  result.cacheHitRate = result.totalRequests > 0 ? (result.cachedRequests / result.totalRequests) * 100 : 0;
  result.fallbackRate = result.totalRequests > 0 ? (result.fallbackRequests / result.totalRequests) * 100 : 0;
  
  return result;
}

module.exports = {
  calculateCost,
  logAIUsage,
  getUserUsageSummary,
  checkBudget,
  getPlatformAnalytics,
  estimatePromptCost,
  getCostEfficiencyMetrics,
  MODEL_COSTS,
};
