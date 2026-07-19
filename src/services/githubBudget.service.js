const SAFETY_FLOOR = 10;

class GitHubBudget {
  constructor() {
    this.remaining = 60;
    this.resetAt = null;
    this.lastUpdated = null;
  }

  recordResponse(headers) {
    if (!headers) return;

    const remaining = headers["x-ratelimit-remaining"];
    const reset = headers["x-ratelimit-reset"];

    if (remaining !== undefined) {
      this.remaining = parseInt(remaining, 10);
    }
    if (reset !== undefined) {
      this.resetAt = new Date(parseInt(reset, 10) * 1000);
    }
    this.lastUpdated = new Date();
  }

  checkBudget(estimatedCalls) {
    if (this.remaining - estimatedCalls < SAFETY_FLOOR) {
      const resetTime = this.resetAt
        ? this.resetAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        : "unknown";
      return {
        allowed: false,
        message: `GitHub API budget insufficient. ${this.remaining} requests remaining. Budget resets at ${resetTime}. Please try again after the reset.`,
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
