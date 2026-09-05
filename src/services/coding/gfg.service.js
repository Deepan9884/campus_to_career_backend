async function fetchGfgStats(username) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername) throw new Error("GeeksforGeeks username is required");

  // Attempt 1: Community API (with short timeout)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://geeks-for-geeks-api.vercel.app/user/${encodeURIComponent(cleanUsername)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.info || data.solvedStats || data.totalProblemsSolved !== undefined)) {
        const info = data.info || {};
        const stats = data.solvedStats || {};
        const totalSolved = Number(stats.overall?.count || data.totalProblemsSolved || 0);
        const easySolved = Number(stats.easy?.count || data.easySolved || 0);
        const mediumSolved = Number(stats.medium?.count || data.mediumSolved || 0);
        const hardSolved = Number(stats.hard?.count || data.hardSolved || 0);
        const codingScore = Number(stats.score || data.codingScore || 0);

        return {
          totalSolved,
          solved: totalSolved,
          easySolved,
          mediumSolved,
          hardSolved,
          codingScore,
          overallRank: info.overallRank || data.overallRank || null,
          byDifficulty: {
            Easy: easySolved || Math.round(totalSolved * 0.5),
            Medium: mediumSolved || Math.round(totalSolved * 0.35),
            Hard: hardSolved || Math.max(0, totalSolved - (easySolved || Math.round(totalSolved * 0.5)) - (mediumSolved || Math.round(totalSolved * 0.35))),
          },
          raw: data,
        };
      }
    }
  } catch {
    // fallback
  }

  // Attempt 2: Direct web scrape from GFG user profile
  const profileUrls = [
    `https://www.geeksforgeeks.org/user/${encodeURIComponent(cleanUsername)}/`,
    `https://www.geeksforgeeks.org/profile/${encodeURIComponent(cleanUsername)}/`,
    `https://auth.geeksforgeeks.org/user/${encodeURIComponent(cleanUsername)}/practice/`,
  ];

  let html = null;
  let lastStatus = 0;

  for (const url of profileUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      lastStatus = res.status;
      if (res.ok) {
        html = await res.text();
        if (html && html.length > 500) break;
      }
    } catch {
      // try next URL
    }
  }

  if (!html) {
    if (lastStatus === 404) throw new Error(`GeeksforGeeks user '${cleanUsername}' not found`);
    throw new Error(`GeeksforGeeks profile could not be reached (HTTP ${lastStatus || "network error"})`);
  }

  // 1. Total problems solved: match Next.js RSC streaming JSON or HTML text
  const solvedMatch =
    html.match(/\\"total_problems_solved\\"\s*:\s*(\d+)/i) ||
    html.match(/"total_problems_solved"\s*:\s*(\d+)/i) ||
    html.match(/total_problems_solved\s*:\s*(\d+)/i) ||
    html.match(/Total Problems Solved:?\s*<[^>]*>(\d+)/i) ||
    html.match(/Total Problems Solved:?\s*(\d+)/i) ||
    html.match(/problemsSolved[^>]*>(\d+)/i) ||
    html.match(/problem-solved[^>]*>(\d+)/i);
  const totalSolved = solvedMatch ? parseInt(solvedMatch[1], 10) : 0;

  // 2. Overall coding score
  const scoreMatch =
    html.match(/\\"score\\"\s*:\s*(\d+)/i) ||
    html.match(/"score"\s*:\s*(\d+)/i) ||
    html.match(/score\s*:\s*(\d+)/i) ||
    html.match(/Overall Coding Score:?\s*<[^>]*>(\d+)/i) ||
    html.match(/Overall Coding Score:?\s*(\d+)/i) ||
    html.match(/coding-score[^>]*>(\d+)/i);
  const codingScore = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  // 3. Monthly score
  const monthlyScoreMatch =
    html.match(/\\"monthly_score\\"\s*:\s*(\d+)/i) ||
    html.match(/"monthly_score"\s*:\s*(\d+)/i);
  const monthlyScore = monthlyScoreMatch ? parseInt(monthlyScoreMatch[1], 10) : 0;

  // 4. Institute Rank
  const rankMatch =
    html.match(/\\"institute_rank\\"\s*:\s*\\"([^\\"]*)\\"/i) ||
    html.match(/"institute_rank"\s*:\s*"([^"]*)"/i) ||
    html.match(/Institute Rank:?\s*<[^>]*>(\d+)/i) ||
    html.match(/Institute Rank:?\s*(\d+)/i);
  const instituteRank = rankMatch && rankMatch[1] && rankMatch[1] !== '""' ? rankMatch[1].trim() : null;

  // 5. POTD Streak
  const streakMatch =
    html.match(/\\"pod_solved_current_streak\\"\s*:\s*(\d+)/i) ||
    html.match(/"pod_solved_current_streak"\s*:\s*(\d+)/i) ||
    html.match(/currentStreak[^>]*>(\d+)/i);
  const streak = streakMatch ? parseInt(streakMatch[1], 10) : 0;

  // 6. Detailed Difficulty breakdown (if present in Next.js props or proportional)
  const easyMatch = html.match(/\\"(?:easy|Easy)\\"\s*:\s*(\d+)/) || html.match(/"(?:easy|Easy)"\s*:\s*(\d+)/);
  const medMatch = html.match(/\\"(?:medium|Medium)\\"\s*:\s*(\d+)/) || html.match(/"(?:medium|Medium)"\s*:\s*(\d+)/);
  const hardMatch = html.match(/\\"(?:hard|Hard)\\"\s*:\s*(\d+)/) || html.match(/"(?:hard|Hard)"\s*:\s*(\d+)/);

  let easy = easyMatch ? parseInt(easyMatch[1], 10) : Math.round(totalSolved * 0.5);
  let medium = medMatch ? parseInt(medMatch[1], 10) : Math.round(totalSolved * 0.35);
  let hard = hardMatch ? parseInt(hardMatch[1], 10) : Math.max(0, totalSolved - easy - medium);

  if (easy + medium + hard === 0 && totalSolved > 0) {
    easy = Math.round(totalSolved * 0.5);
    medium = Math.round(totalSolved * 0.35);
    hard = Math.max(0, totalSolved - easy - medium);
  }

  return {
    totalSolved,
    solved: totalSolved,
    easySolved: easy,
    mediumSolved: medium,
    hardSolved: hard,
    codingScore,
    monthlyScore,
    instituteRank,
    overallRank: instituteRank ? `Institute Rank #${instituteRank}` : null,
    streak,
    byDifficulty: {
      Easy: easy,
      Medium: medium,
      Hard: hard,
    },
    raw: {
      codingScore,
      monthlyScore,
      totalSolved,
      instituteRank,
      streak,
    },
  };
}

module.exports = { fetchGfgStats };
