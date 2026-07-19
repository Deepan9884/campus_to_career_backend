const http = require("http");

const BASE_URL = "localhost";
const PORT = 5000;

function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: BASE_URL,
            port: PORT,
            path,
            method,
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                "Content-Type": "application/json",
            },
        };

        const req = http.request(opts, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                const status = res.statusCode;
                try {
                    resolve({ status, body: JSON.parse(data) });
                } catch {
                    resolve({ status, body: data });
                }
            });
        });

        req.on("error", reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

(async () => {
    const unique = Date.now();
    console.log("[evidence] Registering user...");
    const reg = await request(
        "POST",
        "/api/auth/register",
        {
            name: `Badge Evidence ${unique}`,
            email: `badge_evidence_${unique}@example.com`,
            password: "Password123!",
        },
    );

    if (reg.status !== 200 && reg.status !== 201) {
        console.error("[evidence] Register failed:", reg.status, reg.body);
        process.exit(1);
    }

    const token = reg.body?.data?.accessToken;
    if (!token) {
        console.error("[evidence] No accessToken in register response:", reg.body);
        process.exit(1);
    }

    console.log("[evidence] Token obtained.");

    console.log("[evidence] Starting interview...");
    const start = await request(
        "POST",
        "/api/interview/start",
        { domain: "behavioral", questionCount: 3 },
        token,
    );

    if (start.status !== 200) {
        console.error("[evidence] Start interview failed:", start.status, start.body);
        process.exit(1);
    }

    const interviewId = start.body?.data?._id;
    if (!interviewId) {
        console.error("[evidence] No interviewId:", start.body);
        process.exit(1);
    }

    const questions = start.body?.data?.questions || [];
    console.log(`[evidence] Interview started id=${interviewId} questions=${questions.length}`);

    const answers = [
        "At my previous company, I handled competing priorities by aligning stakeholders on impact, negotiating timelines, and tracking outcomes with clear metrics.",
        "I disagreed with a teammate on architecture approach; we compared tradeoffs, ran a small spike to validate assumptions, and converged on a hybrid strategy that worked.",
        "I mentored a junior developer via pair programming, daily check-ins, and structured feedback, enabling them to ship independently within a few months.",
    ];

    for (let i = 0; i < questions.length; i++) {
        const ans = answers[i] || answers[answers.length - 1];
        const a = await request(
            "POST",
            `/api/interview/${interviewId}/answer`,
            { questionIndex: i, answer: ans },
            token,
        );
        console.log(`[evidence] Answer ${i + 1}/${questions.length} status=${a.status}`);
    }

    console.log("[evidence] Finishing interview...");
    const finish = await request(
        "POST",
        `/api/interview/${interviewId}/finish`,
        null,
        token,
    );

    if (finish.status !== 200) {
        console.error("[evidence] Finish interview failed:", finish.status, finish.body);
        process.exit(1);
    }

    console.log("[evidence] Interview finished. overallScore=", finish.body?.data?.overallScore);

    console.log("[evidence] Fetching /api/badges...");
    const badges = await request("GET", "/api/badges", null, token);

    if (badges.status !== 200) {
        console.error("[evidence] GET /api/badges failed:", badges.status, badges.body);
        process.exit(1);
    }

    console.log("[evidence] /api/badges response:");
    console.log(JSON.stringify(badges.body, null, 2));
})();
