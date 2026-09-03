const budget = require("./githubBudget.service");
const env = require("../config/env");

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "Campus-to-Career-AI/0.1";

async function githubFetch(url) {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
  };

  if (env.GITHUB_TOKEN) {
    headers.Authorization = `token ${env.GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers });

  budget.recordResponse(res.headers);

  if (!res.ok) {
    let errorMessage = `GitHub API error: ${res.status} ${res.statusText}`;
    
    // Provide more helpful error messages
    if (res.status === 403) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const resetTime = res.headers.get("x-ratelimit-reset");
      
      if (remaining === "0" && resetTime) {
        const resetDate = new Date(parseInt(resetTime) * 1000);
        errorMessage = `GitHub API rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}. ${!env.GITHUB_TOKEN ? "Configure GITHUB_TOKEN in .env for higher limits (5000/hour vs 60/hour)." : ""}`;
      } else if (!env.GITHUB_TOKEN) {
        errorMessage = "GitHub API access forbidden. Please configure GITHUB_TOKEN in .env file for authentication.";
      } else {
        errorMessage = "GitHub API access forbidden. Your token may be invalid or expired. Please check GITHUB_TOKEN in .env file.";
      }
    } else if (res.status === 401) {
      errorMessage = "GitHub API authentication failed. Please check your GITHUB_TOKEN in .env file.";
    } else if (res.status === 404) {
      errorMessage = "Repository not found. Please check the repository name and ensure it's public.";
    }
    
    const error = new Error(errorMessage);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

async function getUser(username) {
  const data = await githubFetch(`${GITHUB_API}/users/${encodeURIComponent(username)}`);
  return {
    login: data.login,
    name: data.name,
    avatar_url: data.avatar_url,
    public_repos: data.public_repos,
    bio: data.bio,
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
      updated_at: r.updated_at,
      default_branch: r.default_branch,
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
      const data = await githubFetch(`${GITHUB_API}/repos/${encOwner}/${encRepo}/git/trees/master?recursive=1`);
      return data.tree || [];
    }
    throw err;
  }
}

async function getFileContent(owner, repo, filePath) {
  const encOwner = encodeURIComponent(owner);
  const encRepo = encodeURIComponent(repo);
  const encPath = (filePath || "").split("/").map(encodeURIComponent).join("/");
  const data = await githubFetch(`${GITHUB_API}/repos/${encOwner}/${encRepo}/contents/${encPath}`);
  if (data.encoding === "base64" && data.content) {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }
  return data.content || "";
}

async function getReadme(owner, repo) {
  const encOwner = encodeURIComponent(owner);
  const encRepo = encodeURIComponent(repo);
  const data = await githubFetch(`${GITHUB_API}/repos/${encOwner}/${encRepo}/readme`);
  if (data.encoding === "base64" && data.content) {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }
  return data.content || "";
}

async function getRepoMeta(owner, repo) {
  const encOwner = encodeURIComponent(owner);
  const encRepo = encodeURIComponent(repo);
  const data = await githubFetch(`${GITHUB_API}/repos/${encOwner}/${encRepo}`);
  return {
    name: data.name,
    full_name: data.full_name,
    description: data.description,
    language: data.language,
    stargazers_count: data.stargazers_count,
    forks_count: data.forks_count,
    updated_at: data.updated_at,
    default_branch: data.default_branch,
    html_url: data.html_url,
  };
}

module.exports = {
  getUser,
  listPublicRepos,
  getRepoTree,
  getFileContent,
  getReadme,
  getRepoMeta,
};
