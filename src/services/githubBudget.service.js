const env = require("../config/env");

const SAFETY_FLOOR = 2;

class GitHubBudget {
  constructor() {
    this.remaining = env.GITHUB_TOKEN ? 5000 : 60;
    this.resetAt = null;
    this.lastUpdated = null;
  }

  recordResponse(headers) {
    if (!headers) return;

    const remaining = typeof headers.get === "function"
      ? headers.get("x-ratelimit-remaining")
      : headers["x-ratelimit-remaining"];
    const reset = typeof headers.get === "function"
      ? headers.get("x-ratelimit-reset")
      : headers["x-ratelimit-reset"];

    if (remaining !== undefined && remaining !== null) {
      this.remaining = parseInt(remaining, 10);
    }
    if (reset !== undefined && reset !== null) {
      this.resetAt = new Date(parseInt(reset, 10) * 1000);
    }
    this.lastUpdated = new Date();
  }

  checkBudget(estimatedCalls) {
    // If reset window has passed, restore budget
    if (this.resetAt && new Date() >= this.resetAt) {
      this.remaining = env.GITHUB_TOKEN ? 5000 : 60;
      this.resetAt = null;
    }

    // Only block when we know for sure remaining is lower than safety floor and reset is in the future
    if (this.resetAt && new Date() < this.resetAt && this.remaining - estimatedCalls < SAFETY_FLOOR) {
      const resetTime = this.resetAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      return {
        allowed: false,
        message: `GitHub API budget reached (${this.remaining} remaining). Resets at ${resetTime}. Configure GITHUB_TOKEN for 5,000 requests/hour limit.`,
        remaining: this.remaining,
        resetAt: this.resetAt,
      };
    }
    return { allowed: true, remaining: this.remaining };
  }

  getStatus() {
    return {
      remaining: this.remaining,
      resetAt: this.resetAt,
      lastUpdated: this.lastUpdated,
    };
  }
}

module.exports = new GitHubBudget();

