const budget = require("./githubBudget.service");
const env = require("../config/env");

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "Campus-to-Career-AI/0.1";

// In-memory cache to prevent burning GitHub API rate limits
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlMs = CACHE_TTL_MS) {
  if (cache.size > 250) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function githubFetch(url, options = {}) {
  const isGet = !options.method || options.method === "GET";
  if (isGet) {
    const cached = getCached(url);
    if (cached) {
      return cached;
    }
  }

  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
    ...options.headers,
  };

  if (env.GITHUB_TOKEN) {
    const token = env.GITHUB_TOKEN.trim();
    headers.Authorization = token.startsWith("Bearer ") || token.startsWith("token ")
      ? token
      : `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  budget.recordResponse(res.headers);

  if (!res.ok) {
    let errorMessage = `GitHub API error: ${res.status} ${res.statusText}`;

    // Provide helpful error messages
    if (res.status === 403 || res.status === 429) {
      const remaining = typeof res.headers.get === "function" ? res.headers.get("x-ratelimit-remaining") : null;
      const resetTime = typeof res.headers.get === "function" ? res.headers.get("x-ratelimit-reset") : null;

      if (remaining === "0" && resetTime) {
        const resetDate = new Date(parseInt(resetTime, 10) * 1000);
        errorMessage = `GitHub API rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}. ${!env.GITHUB_TOKEN ? "Configure GITHUB_TOKEN in .env for 5,000/hour limit." : ""}`;
      } else if (!env.GITHUB_TOKEN) {
        errorMessage = "GitHub API rate limit reached. Configure GITHUB_TOKEN in backend .env for higher limits.";
      } else {
        errorMessage = "GitHub API access forbidden or rate-limited. Please check GITHUB_TOKEN in .env.";
      }
    } else if (res.status === 401) {
      errorMessage = "GitHub API authentication failed. Please verify your GITHUB_TOKEN in .env.";
    } else if (res.status === 404) {
      errorMessage = "Repository or resource not found on GitHub.";
    }

    const error = new Error(errorMessage);
    error.status = res.status;
    throw error;
  }

  const data = await res.json();
  if (isGet) {
    setCache(url, data);
  }
  return data;
}

async function getUser(username) {
  const data = await githubFetch(`${GITHUB_API}/users/${encodeURIComponent(username)}`);
  return {
    login: data.login,
    name: data.name || data.login,
    avatar_url: data.avatar_url,
    public_repos: data.public_repos || 0,
    bio: data.bio || "",
    html_url: data.html_url,
  };
}

async function listPublicRepos(username) {
  const data = await githubFetch(
    `${GITHUB_API}/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&direction=desc`,
  );
  return data
    .filter((r) => !r.fork)
    .map((r) => ({
      name: r.name,
      full_name: r.full_name,
      html_url: r.html_url,
      description: r.description,
      language: r.language,
      stargazers_count: r.stargazers_count,
      forks_count: r.forks_count,
      updated_at: r.updated_at,
      default_branch: r.default_branch || "main",
    }));
}

async function getRepoTree(owner, repo, branch = "main") {
  const encOwner = encodeURIComponent(owner);
  const encRepo = encodeURIComponent(repo);
  const encBranch = encodeURIComponent(branch);
  try {
    const data = await githubFetch(`${GITHUB_API}/repos/${encOwner}/${encRepo}/git/trees/${encBranch}?recursive=1`);
    return data.tree || [];
  } catch (err) {
    if (err.status === 404) {
      try {
        const data = await githubFetch(`${GITHUB_API}/repos/${encOwner}/${encRepo}/git/trees/master?recursive=1`);
        return data.tree || [];
      } catch {
        return [];
      }
    }
    // If rate-limited or tree fetch fails, return empty list gracefully
    if (err.status === 403 || err.status === 429) {
      return [];
    }
    throw err;
  }
}

async function getFileContent(owner, repo, filePath) {
  const encOwner = encodeURIComponent(owner);
  const encRepo = encodeURIComponent(repo);
  const encPath = (filePath || "").split("/").map(encodeURIComponent).join("/");
  try {
    const data = await githubFetch(`${GITHUB_API}/repos/${encOwner}/${encRepo}/contents/${encPath}`);
    if (data.encoding === "base64" && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return data.content || "";
  } catch (err) {
    // Fallback to raw CDN if API is rate limited
    if (err.status === 403 || err.status === 429) {
      try {
        const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${filePath}`, {
          headers: { "User-Agent": USER_AGENT },
        });
        if (rawRes.ok) {
          return await rawRes.text();
        }
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

async function getReadme(owner, repo) {
  const encOwner = encodeURIComponent(owner);
  const encRepo = encodeURIComponent(repo);
  try {
    const data = await githubFetch(`${GITHUB_API}/repos/${encOwner}/${encRepo}/readme`);
    if (data.encoding === "base64" && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return data.content || "";
  } catch (err) {
    // If rate-limited on API or 404, try raw CDN fallback
    try {
      const candidates = ["README.md", "readme.md", "README", "readme.markdown"];
      for (const candidate of candidates) {
        const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${candidate}`, {
          headers: { "User-Agent": USER_AGENT },
        });
        if (rawRes.ok) {
          return await rawRes.text();
        }
      }
    } catch {
      // ignore
    }
    return "";
  }
}

async function getRepoMeta(owner, repo) {
  const encOwner = encodeURIComponent(owner);
  const encRepo = encodeURIComponent(repo);
  try {
    const data = await githubFetch(`${GITHUB_API}/repos/${encOwner}/${encRepo}`);
    return {
      name: data.name,
      full_name: data.full_name,
      description: data.description,
      language: data.language,
      stargazers_count: data.stargazers_count || 0,
      forks_count: data.forks_count || 0,
      updated_at: data.updated_at,
      default_branch: data.default_branch || "main",
      html_url: data.html_url,
    };
  } catch (err) {
    if (err.status === 403 || err.status === 429) {
      return {
        name: repo,
        full_name: `${owner}/${repo}`,
        description: "Public GitHub repository",
        language: "Code",
        stargazers_count: 0,
        forks_count: 0,
        updated_at: new Date().toISOString(),
        default_branch: "main",
        html_url: `https://github.com/${owner}/${repo}`,
      };
    }
    throw err;
  }
}

module.exports = {
  getUser,
  listPublicRepos,
  getRepoTree,
  getFileContent,
  getReadme,
  getRepoMeta,
};

