const env = require("../config/env");

class AIRateLimiter {
  constructor() {
    this.rpmLimit = env.GEMINI_MAX_RPM;
    this.rpdLimit = env.GEMINI_MAX_RPD;

    this.rpmWindow = 60 * 1000;
    this.rpdWindow = 24 * 60 * 60 * 1000;

    this.requests = [];
    this.lastRpdReset = this._getMidnightPt();
  }

  _getMidnightPt() {
    const now = new Date();
    const ptOffset = -7 * 60;
    const ptNow = new Date(now.getTime() + ptOffset * 60 * 1000);
    ptNow.setHours(0, 0, 0, 0);
    return ptNow.getTime();
  }

  _maybeResetRpd() {
    const midnight = this._getMidnightPt();
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

    return {
      rpm: {
        current: rpmCount,
        limit: this.rpmLimit,
        remaining: Math.max(0, this.rpmLimit - rpmCount),
      },
      rpd: {
        current: rpdCount,
        limit: this.rpdLimit,
        remaining: Math.max(0, this.rpdLimit - rpdCount),
      },
    };
  }

  async process({ feature }) {
    this._maybeResetRpd();
    const now = Date.now();
    const rpmStart = now - this.rpmWindow;

    const rpmCount = this.requests.filter((r) => r.timestamp > rpmStart).length;
    const rpdCount = this.requests.length;

    // RPD exceeded — reject immediately, do not queue
    if (rpdCount >= this.rpdLimit) {
      return { allowed: false, reason: "RPD_EXCEEDED" };
    }

    // RPM exceeded — queue briefly (up to ~5s) before rejecting
    if (rpmCount >= this.rpmLimit) {
      let waited = 0;
      const maxWait = 5000;
      const pollInterval = 500;

      while (waited < maxWait) {
        await new Promise((r) => setTimeout(r, pollInterval));
        waited += pollInterval;

        const stillRpmCount = this.requests.filter(
          (r) => r.timestamp > Date.now() - this.rpmWindow,
        ).length;
        const stillRpdCount = this.requests.length;

        if (stillRpdCount >= this.rpdLimit) {
          return { allowed: false, reason: "RPD_EXCEEDED" };
        }
        if (stillRpmCount < this.rpmLimit) {
          this.requests.push({ timestamp: Date.now(), feature });
          return { allowed: true };
        }
      }

      return { allowed: false, reason: "RPM_EXCEEDED" };
    }

    this.requests.push({ timestamp: Date.now(), feature });
    return { allowed: true };
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
