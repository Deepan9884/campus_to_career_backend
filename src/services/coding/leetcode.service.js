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
    // NOTE: This uses LeetCode's unofficial GraphQL endpoint.
    // We keep it isolated; caller handles exceptions.

    const query = `
    query userProblems($username: String!) {
      matchedUser(username: $username) {
        username
        submitStats {
          acSubmissionNum { difficulty count }
        }
      }
    }
  `;

    const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
            "content-type": "application/json",
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

    const ac =
        data?.data?.matchedUser?.submitStats?.acSubmissionNum || null;

    const byDifficulty = {};
    let solved = 0;
    if (Array.isArray(ac)) {
        for (const item of ac) {
            const diff = item?.difficulty;
            const cnt = item?.count;
            if (!diff || typeof cnt !== "number") continue;
            byDifficulty[diff] = cnt;
            if (diff !== "All") {
                solved += cnt;
            }
        }
    }

    return {
        solved,
        byDifficulty: normalizeDifficulties(byDifficulty),
        raw: data,
    };
}

module.exports = { fetchLeetCodeStats };

