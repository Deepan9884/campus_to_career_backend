const { GoogleGenAI } = require("@google/genai");
const env = require("./env");

class KeyPoolManager {
  constructor(apiKeys = []) {
    this.keys = apiKeys.filter(Boolean);
    if (this.keys.length === 0 && env.GEMINI_API_KEY) {
      this.keys = [env.GEMINI_API_KEY];
    }
    
    this.clients = this.keys.map((apiKey, index) => ({
      index,
      keyMask: apiKey.substring(0, 6) + "..." + apiKey.substring(apiKey.length - 4),
      rawKey: apiKey,
      client: new GoogleGenAI({ apiKey }),
      cooldownUntil: 0,
      consecutiveErrors: 0,
      totalRequests: 0,
      successfulRequests: 0,
    }));

    this.currentIndex = 0;
  }

  get poolSize() {
    return this.clients.length;
  }

  /**
   * Get the next best available client.
   * Prefers clients that are not in cooldown.
   */
  getClient() {
    if (this.clients.length === 0) {
      return null;
    }

    const now = Date.now();
    const available = this.clients.filter((c) => c.cooldownUntil <= now);

    if (available.length > 0) {
      this.currentIndex = (this.currentIndex + 1) % available.length;
      const chosen = available[this.currentIndex];
      chosen.totalRequests++;
      return chosen;
    }

    // All clients in cooldown — pick the one whose cooldown expires earliest
    const earliest = [...this.clients].sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0];
    earliest.totalRequests++;
    return earliest;
  }

  /**
   * Mark a key as rate-limited or failed with a temporary cooldown.
   */
  reportError(clientEntry, isQuotaOrRateLimit = false) {
    if (!clientEntry) return;
    clientEntry.consecutiveErrors++;
    const cooldownMs = isQuotaOrRateLimit
      ? Math.min(30000 * Math.pow(1.5, clientEntry.consecutiveErrors - 1), 120000)
      : 5000;
    clientEntry.cooldownUntil = Date.now() + cooldownMs;
    console.warn(
      `[AI KeyPool] Key ${clientEntry.keyMask} put on cooldown for ${Math.round(cooldownMs / 1000)}s (Errors: ${clientEntry.consecutiveErrors})`
    );
  }

  /**
   * Report success on a client to reset consecutive errors and clear cooldown.
   */
  reportSuccess(clientEntry) {
    if (!clientEntry) return;
    clientEntry.consecutiveErrors = 0;
    clientEntry.cooldownUntil = 0;
    clientEntry.successfulRequests++;
  }

  getStatus() {
    const now = Date.now();
    return this.clients.map((c) => ({
      key: c.keyMask,
      available: c.cooldownUntil <= now,
      cooldownSeconds: Math.max(0, Math.round((c.cooldownUntil - now) / 1000)),
      totalRequests: c.totalRequests,
      successfulRequests: c.successfulRequests,
    }));
  }
}

const keyPool = new KeyPoolManager(env.GEMINI_API_KEYS);
const primaryClientEntry = keyPool.getClient() || { client: new GoogleGenAI({ apiKey: env.GEMINI_API_KEY || "dummy" }) };

const defaultModel = env.GEMINI_MODEL_DEFAULT;
const fallbackModel = env.GEMINI_MODEL_FALLBACK;
const modelFallbackList = Array.from(
  new Set([defaultModel, fallbackModel, ...env.GEMINI_FALLBACK_MODELS])
).filter(Boolean);

module.exports = {
  genAI: primaryClientEntry.client,
  keyPool,
  defaultModel,
  fallbackModel,
  modelFallbackList,
};
