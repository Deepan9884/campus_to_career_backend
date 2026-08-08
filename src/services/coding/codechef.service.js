async function fetchCodeChefStats(username) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername) throw new Error("CodeChef username is required");

  // Attempt 1: Community API
  try {
    const res = await fetch(`https://codechef-api.vercel.app/handle/${encodeURIComponent(cleanUsername)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success !== false) {
        const solved = Number(data.problemsSolved || data.totalSolved || 0);
        return {
          totalSolved: solved,
          solved,
          currentRating: Number(data.currentRating || data.rating || 0),
          highestRating: Number(data.highestRating || 0),
          stars: data.stars || "1★",
          globalRank: data.globalRank || null,
          countryRank: data.countryRank || null,
          byDifficulty: {
            Easy: Math.round(solved * 0.5),
            Medium: Math.round(solved * 0.35),
            Hard: Math.round(solved * 0.15),
          },
          raw: data,
        };
      }
    }
  } catch {
    // fallback
  }

  // Attempt 2: Direct web page scrape from CodeChef profile
  const res = await fetch(`https://www.codechef.com/users/${encodeURIComponent(cleanUsername)}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error(`CodeChef user '${cleanUsername}' not found`);
    throw new Error(`CodeChef HTTP error ${res.status}`);
  }

  const html = await res.text();
  const ratingMatch =
    html.match(/class="rating-number">(\d+)/i) || html.match(/rating-header[^>]*>(\d+)/i);
  const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : 0;

  const starsMatch =
    html.match(/(\d+)★/i) || html.match(/class="rating-star">([^<]+)/i);
  const stars = starsMatch ? (starsMatch[1].includes("★") ? starsMatch[1] : `${starsMatch[1]}★`) : "1★";

  const solvedMatch =
    html.match(/Total Problems Solved:?\s*(\d+)/i) || html.match(/Fully Solved\s*\(([^)]+)\)/i);
  const totalSolved = solvedMatch ? parseInt(solvedMatch[1].replace(/,/g, ""), 10) : 0;

  const globalRankMatch = html.match(/Global Rank:?\s*<strong>(\d+)/i);
  const globalRank = globalRankMatch ? parseInt(globalRankMatch[1], 10) : null;

  return {
    totalSolved,
    solved: totalSolved,
    currentRating: rating,
    stars,
    globalRank,
    byDifficulty: {
      Easy: Math.round(totalSolved * 0.5),
      Medium: Math.round(totalSolved * 0.35),
      Hard: Math.round(totalSolved * 0.15),
    },
    raw: { rating, stars, totalSolved, globalRank },
  };
}

module.exports = { fetchCodeChefStats };
