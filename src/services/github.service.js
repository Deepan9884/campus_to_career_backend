const budget = require("./githubBudget.service");

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "CareerForge-AI/0.1";

async function githubFetch(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json",
    },
  });

  budget.recordResponse(res.headers);

  if (!res.ok) {
    const error = new Error(`GitHub API error: ${res.status} ${res.statusText}`);
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
  try {
    const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
    return data.tree || [];
  } catch (err) {
    if (err.status === 404) {
      const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees/master?recursive=1`);
      return data.tree || [];
    }
    throw err;
  }
}

async function getFileContent(owner, repo, path) {
  const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`);
  if (data.encoding === "base64" && data.content) {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }
  return data.content || "";
}

async function getReadme(owner, repo) {
  const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`);
  if (data.encoding === "base64" && data.content) {
    return Buffer.from(data.content, "base64").toString("utf-8");
  }
  return data.content || "";
}

async function getRepoMeta(owner, repo) {
  const data = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}`);
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
