const { genAI, defaultModel, fallbackModel } = require("../config/gemini");
const rateLimiter = require("./aiRateLimiter.service");
const AIUsageLog = require("../models/AIUsageLog.model");

const ERROR_TYPES = {
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  TIMEOUT: "TIMEOUT",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  API_ERROR: "API_ERROR",
  UNKNOWN: "UNKNOWN",
};

const RETRYABLE_ERROR_MESSAGES = [
  "network",
  "timeout",
  "internal",
  "unavailable",
  "503",
  "500",
  "429",
  "too many requests",
  "rate limit",
  "service unavailable",
];

function isRetryable(error) {
  const msg = (error.message || "").toLowerCase();
  return RETRYABLE_ERROR_MESSAGES.some((keyword) => msg.includes(keyword));
}

function isBadRequest(error) {
  const msg = (error.message || "").toLowerCase();
  return (
    msg.includes("400") ||
    msg.includes("bad request") ||
    msg.includes("invalid argument") ||
    msg.includes("permission") ||
    msg.includes("not found") ||
    msg.includes("403")
  );
}

function classifyError(error) {
  const msg = (error.message || "").toLowerCase();

  if (
    msg.includes("quota") ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("resource exhausted")
  ) {
    return { type: ERROR_TYPES.QUOTA_EXCEEDED, retryable: true };
  }
  if (msg.includes("timeout") || msg.includes("deadline")) {
    return { type: ERROR_TYPES.TIMEOUT, retryable: true };
  }

  if (isBadRequest(error)) {
    return { type: ERROR_TYPES.API_ERROR, retryable: false };
  }

  if (isRetryable(error)) {
    return { type: ERROR_TYPES.API_ERROR, retryable: true };
  }

  return { type: ERROR_TYPES.UNKNOWN, retryable: false };
}

function buildSuccessResult(response, model) {
  const result = {
    success: true,
    data: null,
    raw: null,
    model,
    tokensEstimate: null,
  };

  if (!response) return result;

  result.raw = response.text || null;

  if (response.usageMetadata?.totalTokenCount) {
    result.tokensEstimate = response.usageMetadata.totalTokenCount;
  }

  // Attempt to parse JSON from the text response
  if (result.raw) {
    let text = result.raw;

    // Strip markdown code fences if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(text);
      console.log("[AI] Successfully parsed JSON, keys:", Object.keys(parsed));
      result.data = parsed;
    } catch (e) {
      console.error("[AI] JSON parse failed, text length:", text.length, "error:", e.message);
      console.error("[AI] First 500 chars:", text.substring(0, 500));
      
      // Attempt to fix common JSON issues (scientific notation numbers)
      try {
        const fixedText = text.replace(/([0-9]+\.[0-9]+)e[+-]?[0-9]+/gi, (match) => {
          return Number(match).toFixed(2);
        });
        const parsed = JSON.parse(fixedText);
        console.log("[AI] Fixed JSON parse succeeded");
        result.data = parsed;
      } catch (e2) {
        console.error("[AI] Fixed JSON parse also failed:", e2.message);
        // Text mode — data is the raw text
        result.data = text;
      }
    }
  }

  return result;
}

function buildErrorResult(errorType, message, retryable) {
  return {
    success: false,
    data: null,
    raw: null,
    model: null,
    tokensEstimate: null,
    errorType,
    message,
    retryable,
  };
}

async function logUsage({ userId, feature, model, success, errorType, tokensEstimate }) {
  try {
    await AIUsageLog.create({
      userId,
      feature,
      model,
      success,
      errorType: errorType || null,
      tokensEstimate: tokensEstimate || null,
    });
  } catch (err) {
    console.error("[AIUsageLog] Failed to persist usage log:", {
      feature,
      userId,
      error: err.message,
    });
  }
}

async function generateContent({ prompt, responseSchema, model, feature = "general", userId }) {
  const modelName = model || defaultModel;
  const resultMeta = { feature, model: modelName, userId };

  // Step 1: Check rate limiter before making any API call
  const throttle = await rateLimiter.process({ feature });
  if (!throttle.allowed) {
    const reason = throttle.reason || "QUOTA_EXCEEDED";
    const message =
      reason === "RPD_EXCEEDED"
        ? "Our AI service has reached its daily limit. Please try again tomorrow."
        : "Our AI service is busy right now. Please wait a moment and try again.";

    const errorResult = buildErrorResult(ERROR_TYPES.QUOTA_EXCEEDED, message, false);
    await logUsage({ ...resultMeta, success: false, errorType: ERROR_TYPES.QUOTA_EXCEEDED });
    return errorResult;
  }

  // Step 2: Attempt the API call with retry
  let lastError = null;
  let lastClassification = null;

  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const config = {};

      if (responseSchema) {
        config.responseMimeType = "application/json";
        config.responseSchema = responseSchema;
      }

      // Increase output token limit for large structured responses (roadmaps, etc.)
      config.maxOutputTokens = 8192;

      const response = await genAI.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config,
      });

      const result = buildSuccessResult(response, modelName);
      await logUsage({ ...resultMeta, success: true, tokensEstimate: result.tokensEstimate });
      return result;
    } catch (error) {
      lastError = error;
      lastClassification = classifyError(error);

      // Don't retry bad requests
      if (!lastClassification.retryable) {
        break;
      }
    }
  }

  // All retries exhausted
  const errorResult = buildErrorResult(
    lastClassification?.type || ERROR_TYPES.UNKNOWN,
    lastClassification?.retryable
      ? "AI service temporarily unavailable. Please try again."
      : lastError?.message || "An unexpected error occurred while contacting the AI service.",
    lastClassification?.retryable || false,
  );

  await logUsage({
    ...resultMeta,
    success: false,
    errorType: lastClassification?.type || ERROR_TYPES.UNKNOWN,
  });

  return errorResult;
}

module.exports = {
  generateContent,
  getQuotaStatus: rateLimiter.getQuotaStatus.bind(rateLimiter),
  getUsageSummary: rateLimiter.getUsageSummary.bind(rateLimiter),
  ERROR_TYPES,
};
