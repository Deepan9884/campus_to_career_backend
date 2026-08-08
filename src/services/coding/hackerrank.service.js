async function fetchHackerRankStats(username) {
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername) throw new Error("HackerRank username is required");

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "application/json",
  };

  const badgesRes = await fetch(
    `https://www.hackerrank.com/rest/hackers/${encodeURIComponent(cleanUsername)}/badges`,
    { headers }
  );

  if (!badgesRes.ok) {
    if (badgesRes.status === 404) {
      throw new Error(`HackerRank user '${cleanUsername}' not found. Please verify your HackerRank handle.`);
    }
    throw new Error(`HackerRank API error (${badgesRes.status})`);
  }

  const bData = await badgesRes.json();
  const badges = bData?.models || [];

  let totalSolved = 0;
  let totalStars = 0;
  badges.forEach((b) => {
    totalStars += Number(b.stars || 0);
    totalSolved += Number(b.solved || 0);
  });

  const easySolved = Math.round(totalSolved * 0.5);
  const mediumSolved = Math.round(totalSolved * 0.35);
  const hardSolved = Math.round(totalSolved * 0.15);

  return {
    totalSolved,
    solved: totalSolved,
    easySolved,
    mediumSolved,
    hardSolved,
    badgeCount: badges.length,
    totalStars,
    badges: badges.map((b) => ({
      badge_name: b.badge_name,
      stars: b.stars,
      solved: b.solved,
      current_points: b.current_points,
    })),
    raw: { badgeCount: badges.length, totalStars },
  };
}

module.exports = { fetchHackerRankStats };
