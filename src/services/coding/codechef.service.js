async function fetchCodeChefStats(username) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername) throw new Error("CodeChef username is required");

  // Attempt 1: Community API (with short timeout)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://codechef-api.vercel.app/handle/${encodeURIComponent(cleanUsername)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success !== false) {
        const solved = Number(data.problemsSolved || data.totalSolved || 0);
        const currentRating = Number(data.currentRating || data.rating || 0);
        const highestRating = Number(data.highestRating || currentRating || 0);
        const globalRank = data.globalRank || null;
        const countryRank = data.countryRank || null;

        return {
          totalSolved: solved,
          solved,
          currentRating,
          highestRating,
          stars: data.stars || "1★",
          globalRank,
          countryRank,
          dsaRank: data.dsaRank || null,
          dsaRating: data.dsaRating || null,
          contestRank: data.contestRank || globalRank || null,
          byDifficulty: {
            Easy: Math.round(solved * 0.5),
            Medium: Math.round(solved * 0.35),
            Hard: Math.max(0, solved - Math.round(solved * 0.5) - Math.round(solved * 0.35)),
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
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error(`CodeChef user '${cleanUsername}' not found`);
    throw new Error(`CodeChef HTTP error ${res.status}`);
  }

  const html = await res.text();

  // 1. Current Rating
  const ratingMatch =
    html.match(/id="rating-block-all"[\s\S]*?class="rating-number">\s*([0-9]+)/i) ||
    html.match(/class="rating-number">\s*([0-9]+)/i) ||
    html.match(/rating-header[^>]*>\s*([0-9]+)/i);
  const currentRating = ratingMatch ? parseInt(ratingMatch[1], 10) : 0;

  // 2. Stars
  const ratingStarSection = html.match(/class="rating-star">([\s\S]*?)<\/div>/i);
  let stars = "1★";
  if (ratingStarSection) {
    const starCount = (ratingStarSection[1].match(/&#9733;|★/g) || []).length;
    if (starCount > 0) stars = `${starCount}★`;
  } else {
    const fallbackStar = html.match(/(\d+)★/i);
    if (fallbackStar) stars = `${fallbackStar[1]}★`;
  }

  // 3. Highest Rating
  const highestMatch = html.match(/\(Highest Rating\s*(\d+)\)/i);
  const highestRating = highestMatch ? parseInt(highestMatch[1], 10) : currentRating;

  // 4. Global Rank
  const titleRankMatch = html.match(/with global rank (\d+)/i);
  const globalRankMatch =
    titleRankMatch ||
    html.match(/<a href="\/ratings\/all[^"]*">[\s\S]*?<strong>\s*([0-9]+|Inactive)\s*<\/strong>[\s\S]*?<\/a>\s*Global Rank/i) ||
    html.match(/Global Rank[\s\S]*?<strong>\s*([0-9]+|Inactive)\s*<\/strong>/i);
  let globalRank = globalRankMatch ? globalRankMatch[1].trim() : null;
  if (globalRank && !isNaN(Number(globalRank))) {
    globalRank = Number(globalRank);
  }

  // 5. Country Rank
  const countryRankMatch =
    html.match(/<a href="\/ratings\/all\?filterBy=Country%3D[^"]*">[\s\S]*?<strong>\s*([0-9]+|Inactive)\s*<\/strong>[\s\S]*?<\/a>\s*Country Rank/i) ||
    html.match(/Country Rank[\s\S]*?<strong>\s*([0-9]+|Inactive)\s*<\/strong>/i);
  let countryRank = countryRankMatch ? countryRankMatch[1].trim() : null;
  if (countryRank && !isNaN(Number(countryRank))) {
    countryRank = Number(countryRank);
  }

  // 6. DSA Rating & DSA Rank
  let dsaRating = null;
  let dsaRank = null;
  const dsaBlockMatch = html.match(/id="rating-block-dsa-monday"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i);
  if (dsaBlockMatch) {
    const dsaHtml = dsaBlockMatch[0];
    const dsaNumMatch = dsaHtml.match(/class="rating-number">\s*([0-9]+|NA)\s*<\/div>/i);
    if (dsaNumMatch && dsaNumMatch[1] !== "NA") {
      dsaRating = parseInt(dsaNumMatch[1], 10);
    }
    const dsaRankM = dsaHtml.match(
      /<a href="\/ratings\/dsa-monday[^"]*">[\s\S]*?<strong>\s*([0-9]+|Inactive)\s*<\/strong>[\s\S]*?<\/a>\s*Global Rank/i
    );
    if (dsaRankM) {
      dsaRank = dsaRankM[1].trim();
      if (!isNaN(Number(dsaRank))) dsaRank = Number(dsaRank);
    }
  }

  // 7. Contest Participated & Contest Rank
  const contestsCountMatch = html.match(/No\. of Contests Participated:\s*<b>(\d+)<\/b>/i);
  let contestsAttended = contestsCountMatch ? parseInt(contestsCountMatch[1], 10) : 0;

  let latestContestRank = null;
  let latestContestName = null;
  let bestContestRank = null;

  const allRatingMatch = html.match(/var\s+all_rating\s*=\s*(\[[^;]+\]);/);
  if (allRatingMatch) {
    try {
      const history = JSON.parse(allRatingMatch[1]);
      if (Array.isArray(history) && history.length > 0) {
        if (!contestsAttended) contestsAttended = history.length;
        const last = history[history.length - 1];
        if (last.rank) latestContestRank = parseInt(last.rank, 10);
        if (last.name) latestContestName = last.name;

        let minRank = Infinity;
        for (const item of history) {
          const r = parseInt(item.rank, 10);
          if (!isNaN(r) && r > 0 && r < minRank) minRank = r;
        }
        if (minRank !== Infinity) bestContestRank = minRank;
      }
    } catch {
      // json parse fallback
    }
  }

  const contestRank = latestContestRank || bestContestRank || null;

  // 8. Total Problems Solved
  const solvedMatch =
    html.match(/Total Problems Solved:?\s*(\d+)/i) ||
    html.match(/Fully Solved\s*\(([^)]+)\)/i);
  const totalSolved = solvedMatch ? parseInt(solvedMatch[1].replace(/,/g, ""), 10) : 0;

  const easy = Math.round(totalSolved * 0.5);
  const medium = Math.round(totalSolved * 0.35);
  const hard = Math.max(0, totalSolved - easy - medium);

  return {
    totalSolved,
    solved: totalSolved,
    currentRating,
    highestRating,
    stars,
    globalRank,
    countryRank,
    dsaRating,
    dsaRank,
    contestRank,
    latestContestRank,
    latestContestName,
    bestContestRank,
    contestsAttended,
    byDifficulty: {
      Easy: easy,
      Medium: medium,
      Hard: hard,
    },
    raw: {
      currentRating,
      highestRating,
      stars,
      globalRank,
      countryRank,
      dsaRating,
      dsaRank,
      contestRank,
      latestContestRank,
      latestContestName,
      bestContestRank,
      contestsAttended,
      totalSolved,
    },
  };
}

module.exports = { fetchCodeChefStats };
