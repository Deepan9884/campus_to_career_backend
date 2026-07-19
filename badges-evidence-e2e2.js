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
    const email = `badge_evidence_${unique}@example.com`;
    const name = `Badge Evidence ${unique}`;

    const reg = await request(
        "POST",
        "/api/auth/register",
        { name, email, password: "Password123!" },
        null,
    );

    if (reg.status !== 200 && reg.status !== 201) {
        console.error(JSON.stringify(reg, null, 2));
        process.exit(1);
    }

    const token = reg.body?.data?.accessToken;
    if (!token) {
        console.error("No accessToken found in register response:", JSON.stringify(reg.body, null, 2));
        process.exit(1);
    }

    const start = await request(
        "POST",
        "/api/interview/start",
        { domain: "behavioral", questionCount: 3 },
        token,
    );

    if (start.status !== 200) {
        console.error("Interview start failed:", JSON.stringify(start.body, null, 2));
        process.exit(1);
    }

    const interviewId = start.body?.data?._id;
    const questions = start.body?.data?.questions || [];
    const answers = [
        "I aligned stakeholders using impact and effort tradeoffs, negotiated timeline adjustments, and tracked measurable outcomes to deliver milestones successfully.",
        "I disagreed with a teammate by comparing options, running a quick proof-of-concept, and converging on a hybrid architecture that balanced maintainability and performance.",
        "I mentored a junior developer via pairing, daily feedback loops, and clear learning milestones, enabling independent feature delivery within a few months.",
    ];

    for (let i = 0; i < questions.length; i++) {
        const ans = answers[i] || answers[answers.length - 1];
        const a = await request(
            "POST",
            `/api/interview/${interviewId}/answer`,
            { questionIndex: i, answer: ans },
            token,
        );
        if (a.status !== 200) {
            console.error(`Answer ${i + 1} failed:`, JSON.stringify(a.body, null, 2));
            process.exit(1);
        }
    }

    const finish = await request(
        "POST",
        `/api/interview/${interviewId}/finish`,
        null,
        token,
    );

    if (finish.status !== 200) {
        console.error("Interview finish failed:", JSON.stringify(finish.body, null, 2));
        process.exit(1);
    }

    const badges = await request("GET", "/api/badges", null, token);

    if (badges.status !== 200) {
        console.error("GET /api/badges failed:", JSON.stringify(badges.body, null, 2));
        process.exit(1);
    }

    // Print only the final badges JSON for evidence
    console.log(JSON.stringify(badges.body, null, 2));
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
