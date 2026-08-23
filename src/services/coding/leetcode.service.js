// Native fetch is available in Node.js 18+

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function normalizeDifficulties(byDifficulty) {
    // Keep only Easy/Medium/Hard if present; otherwise return as-is.
    if (!byDifficulty || typeof byDifficulty !== "object") return null;
    const out = {};
    for (const k of Object.keys(byDifficulty)) out[k] = byDifficulty[k];
    return out;
}

async function fetchLeetCodeStats(username) {
    const query = `
    query userProblems($username: String!) {
      matchedUser(username: $username) {
        username
        profile { ranking userAvatar realName reputation }
        submitStats: submitStatsGlobal {
          acSubmissionNum { difficulty count submissions }
        }
      }
      userContestRanking(username: $username) {
        rating
        globalRanking
        attendedContestsCount
      }
    }
  `;

    const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://leetcode.com",
        },
        body: JSON.stringify({
            query,
            variables: { username },
        }),
    });

    const data = safeJsonParse(await res.text());
    if (!res.ok) {
        const errMsg = data?.message || `LeetCode graphql HTTP ${res.status}`;
        throw new Error(errMsg);
    }
    if (data?.errors?.length) {
        throw new Error(data.errors[0].message || "LeetCode graphql error");
    }

    const matchedUser = data?.data?.matchedUser;
    if (!matchedUser) {
        throw new Error("LeetCode user not found");
    }

    const ac = matchedUser?.submitStats?.acSubmissionNum || [];
    const byDifficulty = {};
    let solved = 0;
    if (Array.isArray(ac)) {
        for (const item of ac) {
            const diff = item?.difficulty;
            const cnt = item?.count;
            if (!diff || typeof cnt !== "number") continue;
            byDifficulty[diff] = cnt;
            if (diff === "All") {
                solved = cnt;
            }
        }
    }

    if (solved === 0 && byDifficulty.Easy !== undefined) {
        solved = (byDifficulty.Easy || 0) + (byDifficulty.Medium || 0) + (byDifficulty.Hard || 0);
    }

    const contest = data?.data?.userContestRanking;
    const rating = contest?.rating ? Math.round(contest.rating) : 1500;
    const ranking = matchedUser.profile?.ranking || contest?.globalRanking || 0;

    return {
        solved,
        easy: byDifficulty.Easy || 0,
        medium: byDifficulty.Medium || 0,
        hard: byDifficulty.Hard || 0,
        ranking,
        rating,
        byDifficulty: normalizeDifficulties(byDifficulty),
        raw: data,
    };
}

module.exports = { fetchLeetCodeStats };

