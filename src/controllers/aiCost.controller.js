const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const aiCostTracking = require("../services/aiCostTracking.service");

/**
 * Get platform-wide AI cost analytics
 * GET /api/admin/ai-costs/analytics?days=30
 */
const getPlatformAnalytics = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  
  const analytics = await aiCostTracking.getPlatformAnalytics(days);
  
  return ApiResponse.success(analytics, "Platform AI cost analytics retrieved").send(res);
});

/**
 * Get user's AI usage and cost summary
 * GET /api/admin/ai-costs/user/:userId?days=30
 */
const getUserCostSummary = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const days = parseInt(req.query.days) || 30;
  
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  
  const summary = await aiCostTracking.getUserUsageSummary(userId, startDate, endDate);
  
  return ApiResponse.success(summary, "User AI cost summary retrieved").send(res);
});

/**
 * Check user's budget status
 * GET /api/admin/ai-costs/budget/:userId
 */
const checkUserBudget = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const dailyBudget = parseFloat(req.query.dailyBudget) || 5.0;
  const monthlyBudget = parseFloat(req.query.monthlyBudget) || 100.0;
  
  const budgetStatus = await aiCostTracking.checkBudget(userId, dailyBudget, monthlyBudget);
  
  return ApiResponse.success(budgetStatus, "Budget status retrieved").send(res);
});

/**
 * Get cost efficiency metrics
 * GET /api/admin/ai-costs/efficiency?days=30
 */
const getCostEfficiency = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  
  const metrics = await aiCostTracking.getCostEfficiencyMetrics(startDate, endDate);
  
  return ApiResponse.success(metrics, "Cost efficiency metrics retrieved").send(res);
});

/**
 * Estimate cost for a prompt
 * POST /api/admin/ai-costs/estimate
 * Body: { prompt, model, estimatedOutputTokens }
 */
const estimatePromptCost = asyncHandler(async (req, res) => {
  const { prompt, model = "gemini-1.5-flash", estimatedOutputTokens = 1000 } = req.body;
  
  if (!prompt) {
    throw ApiError.badRequest("Prompt is required");
  }
  
  const estimate = aiCostTracking.estimatePromptCost(prompt, model, estimatedOutputTokens);
  
  return ApiResponse.success(estimate, "Cost estimate calculated").send(res);
});

/**
 * Get my AI usage and costs (for current user)
 * GET /api/ai-costs/my-usage?days=30
 */
const getMyUsage = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const days = parseInt(req.query.days) || 30;
  
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  
  const summary = await aiCostTracking.getUserUsageSummary(userId, startDate, endDate);
  const budgetStatus = await aiCostTracking.checkBudget(userId);
  
  return ApiResponse.success(
    {
      usage: summary,
      budget: budgetStatus,
    },
    "Your AI usage retrieved"
  ).send(res);
});

module.exports = {
  getPlatformAnalytics,
  getUserCostSummary,
  checkUserBudget,
  getCostEfficiency,
  estimatePromptCost,
  getMyUsage,
};
