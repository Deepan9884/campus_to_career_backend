async function fetchGfgStats(username) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername) throw new Error("GeeksforGeeks username is required");

  // Attempt 1: Community API
  try {
    const res = await fetch(
      `https://geeks-for-geeks-api.vercel.app/user/${encodeURIComponent(cleanUsername)}`
    );
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
            Hard: hardSolved || Math.round(totalSolved * 0.15),
          },
          raw: data,
        };
      }
    }
  } catch {
    // fallback
  }

  // Attempt 2: Direct web page scrape from GFG user profile
  const res = await fetch(
    `https://www.geeksforgeeks.org/user/${encodeURIComponent(cleanUsername)}/`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    }
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error(`GeeksforGeeks user '${cleanUsername}' not found`);
    throw new Error(`GeeksforGeeks HTTP error ${res.status}`);
  }

  const html = await res.text();

  const scoreMatch =
    html.match(/Overall Coding Score:?\s*<[^>]*>(\d+)/i) || html.match(/score[^>]*>(\d+)/i);
  const codingScore = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

  const solvedMatch =
    html.match(/Total Problems Solved:?\s*<[^>]*>(\d+)/i) ||
    html.match(/problemsSolved[^>]*>(\d+)/i);
  const totalSolved = solvedMatch ? parseInt(solvedMatch[1], 10) : 0;

  return {
    totalSolved,
    solved: totalSolved,
    codingScore,
    byDifficulty: {
      Easy: Math.round(totalSolved * 0.5),
      Medium: Math.round(totalSolved * 0.35),
      Hard: Math.round(totalSolved * 0.15),
    },
    raw: { codingScore, totalSolved },
  };
}

module.exports = { fetchGfgStats };
