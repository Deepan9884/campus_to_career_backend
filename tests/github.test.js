const budget = require("../src/services/githubBudget.service");
const githubService = require("../src/services/github.service");

describe("GitHub Rate Limit & Budget Handling", () => {
  test("githubBudget extracts rate limit headers correctly from Headers object", () => {
    const mockHeaders = new Map([
      ["x-ratelimit-remaining", "45"],
      ["x-ratelimit-reset", String(Math.floor(Date.now() / 1000) + 3600)],
    ]);

    budget.recordResponse(mockHeaders);
    expect(budget.remaining).toBe(45);
    expect(budget.resetAt).toBeInstanceOf(Date);

    const check = budget.checkBudget(5);
    expect(check.allowed).toBe(true);
  });

  test("githubBudget allows requests when reset time has passed", () => {
    const pastTimestamp = String(Math.floor(Date.now() / 1000) - 60);
    const mockHeaders = new Map([
      ["x-ratelimit-remaining", "0"],
      ["x-ratelimit-reset", pastTimestamp],
    ]);

    budget.recordResponse(mockHeaders);
    const check = budget.checkBudget(5);
    expect(check.allowed).toBe(true);
  });

  test("getRepoMeta returns fallback metadata when API is rate-limited", async () => {
    // Mock global fetch to simulate a 429 rate limit
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Map([
        ["x-ratelimit-remaining", "0"],
        ["x-ratelimit-reset", String(Math.floor(Date.now() / 1000) + 1800)],
      ]),
    });

    try {
      const meta = await githubService.getRepoMeta("TestUser", "test-repo");
      expect(meta).toBeDefined();
      expect(meta.name).toBe("test-repo");
      expect(meta.full_name).toBe("TestUser/test-repo");
      expect(meta.default_branch).toBe("main");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
