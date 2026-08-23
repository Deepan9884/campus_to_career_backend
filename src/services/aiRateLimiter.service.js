const env = require("../config/env");
const { keyPool } = require("../config/gemini");
const IORedis = require("ioredis");

const redis = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 1000);
  },
});
redis.on("error", () => {});

const REDIS_RPM_KEY = "ai:rate:rpm";
const REDIS_RPD_KEY = "ai:rate:rpd";

class AIRateLimiter {
  constructor() {
    this.rpmWindow = 60 * 1000;
    this.rpdWindow = 24 * 60 * 60 * 1000;
    this.requests = [];
    this.lastRpdReset = this._getMidnightUtc();

    // Internal request spacing queue
    this.queue = [];
    this.isProcessingQueue = false;
    this.minIntervalMs = 20; // Fast spacing between outbound API triggers
    this.lastDispatchedAt = 0;
  }

  get effectiveRpmLimit() {
    const poolSize = Math.max(1, keyPool.poolSize);
    return Math.max(env.GEMINI_MAX_RPM, env.GEMINI_MAX_RPM * poolSize);
  }

  get effectiveRpdLimit() {
    const poolSize = Math.max(1, keyPool.poolSize);
    return Math.max(env.GEMINI_MAX_RPD, env.GEMINI_MAX_RPD * poolSize);
  }

  _getMidnightUtc() {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
  }

  _maybeResetRpd() {
    const midnight = this._getMidnightUtc();
    if (Date.now() > this.lastRpdReset + this.rpdWindow) {
      this.requests = [];
      this.lastRpdReset = midnight;
    }
  }

  getQuotaStatus() {
    this._maybeResetRpd();
    const now = Date.now();
    const rpmStart = now - this.rpmWindow;

    const rpmCount = this.requests.filter((r) => r.timestamp > rpmStart).length;
    const rpdCount = this.requests.length;
    const rpmLimit = this.effectiveRpmLimit;
    const rpdLimit = this.effectiveRpdLimit;

    return {
      rpm: {
        current: rpmCount,
        limit: rpmLimit,
        remaining: Math.max(0, rpmLimit - rpmCount),
      },
      rpd: {
        current: rpdCount,
        limit: rpdLimit,
        remaining: Math.max(0, rpdLimit - rpdCount),
      },
      activeKeyCount: keyPool.poolSize,
      keyPoolStatus: keyPool.getStatus(),
    };
  }

  /**
   * Redis-backed distributed rate limiting using sorted set sliding window.
   */
  async _processRedis({ feature }) {
    const now = Date.now();
    const rpmStart = now - this.rpmWindow;
    const utcMidnight = this._getMidnightUtc();

    try {
      await redis.zremrangebyscore(REDIS_RPM_KEY, "-inf", rpmStart);
      const rpmCount = await redis.zcard(REDIS_RPM_KEY);
      const rpdCount = await redis.zcard(REDIS_RPD_KEY);

      if (rpdCount >= this.effectiveRpdLimit) {
        return { allowed: false, reason: "RPD_EXCEEDED" };
      }
      if (rpmCount >= this.effectiveRpmLimit) {
        return { allowed: false, reason: "RPM_EXCEEDED" };
      }

      const member = `${now}:${Math.random().toString(36).slice(2)}`;
      const nextMidnight = utcMidnight + 86400000;

      await Promise.all([
        redis.zadd(REDIS_RPM_KEY, now, member),
        redis.pexpire(REDIS_RPM_KEY, this.rpmWindow + 5000),
        redis.zadd(REDIS_RPD_KEY, now, member),
        redis.pexpireat(REDIS_RPD_KEY, nextMidnight),
      ]);

      return { allowed: true };
    } catch {
      return null;
    }
  }

  /**
   * Process and throttle incoming AI requests.
   * Smooths bursts so concurrent requests don't hit 429 errors.
   */
  async process({ feature = "general", maxWaitMs = 30000 }) {
    if (redis.status === "ready") {
      const redisResult = await this._processRedis({ feature });
      if (redisResult !== null) {
        if (redisResult.allowed) {
          this.requests.push({ timestamp: Date.now(), feature });
        }
        return redisResult;
      }
    }

    this._maybeResetRpd();
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const now = Date.now();
      const rpmStart = now - this.rpmWindow;

      const recentRequests = this.requests.filter((r) => r.timestamp > rpmStart);
      const rpmCount = recentRequests.length;
      const rpdCount = this.requests.length;

      if (rpdCount >= this.effectiveRpdLimit) {
        return { allowed: false, reason: "RPD_EXCEEDED" };
      }

      if (rpmCount < this.effectiveRpmLimit) {
        // Enforce spacing between consecutive dispatches to prevent micro-bursts
        const timeSinceLast = now - this.lastDispatchedAt;
        if (timeSinceLast < this.minIntervalMs) {
          await new Promise((r) => setTimeout(r, this.minIntervalMs - timeSinceLast));
        }

        const dispatchTimestamp = Date.now();
        this.lastDispatchedAt = dispatchTimestamp;
        this.requests.push({ timestamp: dispatchTimestamp, feature });
        return { allowed: true };
      }

      // If at limit, calculate wait time until oldest request in window slides out
      const oldestInWindow = recentRequests[0];
      const waitNeeded = oldestInWindow
        ? Math.max(100, oldestInWindow.timestamp + this.rpmWindow - now + 50)
        : 500;

      const sleepTime = Math.min(waitNeeded, 1000);
      await new Promise((r) => setTimeout(r, sleepTime));
    }

    // If wait time exceeded but we have healthy keys and capacity, allow through with warning
    console.warn(`[AIRateLimiter] Request wait limit exceeded for feature: ${feature}. Permitting through with adaptive buffer.`);
    this.requests.push({ timestamp: Date.now(), feature });
    return { allowed: true, throttled: true };
  }

  getUsageSummary() {
    this._maybeResetRpd();
    const now = Date.now();
    const rpmStart = now - this.rpmWindow;

    const featureCounts = {};
    for (const r of this.requests) {
      featureCounts[r.feature] = (featureCounts[r.feature] || 0) + 1;
    }

    return {
      totalRequestsToday: this.requests.length,
      requestsLastMinute: this.requests.filter((r) => r.timestamp > rpmStart).length,
      byFeature: featureCounts,
      ...this.getQuotaStatus(),
    };
  }
}

module.exports = new AIRateLimiter();
