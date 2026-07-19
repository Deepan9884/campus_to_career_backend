const { GoogleGenAI } = require("@google/genai");
const env = require("./env");

const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const defaultModel = env.GEMINI_MODEL_DEFAULT;
const fallbackModel = env.GEMINI_MODEL_FALLBACK;

module.exports = {
  genAI,
  defaultModel,
  fallbackModel,
};
