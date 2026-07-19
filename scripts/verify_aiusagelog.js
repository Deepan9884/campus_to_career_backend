/**
 * Verification script for AIUsageLog entries from Interview module.
 * Triggers both Gemini call sites (start + finish) and queries DB to confirm logs.
 */
const http = require("http");
const mongoose = require("mongoose");

const BASE = "localhost";
const PORT = 5000;
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://careerforgeai:Deepan2005@careerforge-ai.8skj4z.mongodb.net/careerforge_ai?retryWrites=true&w=majority";

/* ---------- helpers ---------- */

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE,
      port: PORT,
      path,
      method,
      headers: { "Content-Type": "application/json", ...headers },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/* ---------- seed questions ---------- */

const seedQuestions = [
  {
    domain: "technical",
    category: "Data Structures",
    targetRoles: ["Backend Developer"],
    difficulty: "medium",
    questionText: "Explain the difference between an Array and a Linked List.",
    idealAnswerPoints: [],
  },
  {
    domain: "technical",
    category: "Algorithms",
    targetRoles: ["Backend Developer"],
    difficulty: "medium",
    questionText: "What is the time complexity of binary search?",
    idealAnswerPoints: [],
  },
  {
    domain: "technical",
    category: "System Design",
    targetRoles: ["Backend Developer"],
    difficulty: "easy",
    questionText: "What is the purpose of a load balancer?",
    idealAnswerPoints: [],
  },
  {
    domain: "technical",
    category: "Databases",
    targetRoles: ["Backend Developer"],
    difficulty: "hard",
    questionText: "Explain database indexing and its trade-offs.",
    idealAnswerPoints: [],
  },
  {
    domain: "technical",
    category: "Networking",
    targetRoles: ["Backend Developer"],
    difficulty: "easy",
    questionText: "What is the difference between HTTP and HTTPS?",
    idealAnswerPoints: [],
  },
];

async function seedQuestionsFn() {
  const Question = require("../src/models/Question.model");
  await Question.deleteMany({});
  await Question.insertMany(seedQuestions);
  console.log(`  => Seeded ${seedQuestions.length} questions into DB.`);
}

/* ---------- main flow ---------- */

async function main() {
  console.log("============================================");
  console.log("  AIUsageLog Verification - Interview Module");
  console.log("============================================\n");

  /* 1. Seed questions */
  console.log("[1] Seeding questions...");
  await seedQuestionsFn();

  /* 2. Register user */
  const testEmail = `verify-${Date.now()}@example.com`;
  console.log(`[2] Registering user: ${testEmail}`);
  const register = await request("POST", "/api/auth/register", {
    name: "Verification User",
    email: testEmail,
    password: "TestPassword123!",
  });
  if (!register.body.success) throw new Error(`Register failed: ${register.body.message}`);
  const token = register.body.data.accessToken;
  const userId = register.body.data.user._id;
  console.log(`  => Token acquired (userId: ${userId})\n`);

  /* 3. Start interview -> triggers interview-question-selection */
  console.log("[3] Starting interview (triggers 'interview-question-selection')...");
  const start = await request(
    "POST",
    "/api/interview/start",
    {
      domain: "technical",
      targetRole: "Backend Developer",
      questionCount: 3,
      difficulty: "medium",
    },
    { Authorization: `Bearer ${token}` }
  );
  if (!start.body.success) throw new Error(`Start failed: ${start.body.message}`);
  const interviewId = start.body.data._id;
  console.log(`  => Interview started (id: ${interviewId})\n`);

  /* 4. Answer all questions */
  console.log("[4] Answering questions...");
  for (let i = 0; i < start.body.data.questions.length; i++) {
    await request(
      "POST",
      `/api/interview/${interviewId}/answer`,
      {
        questionIndex: i,
        answer: `This is my answer for question ${i + 1}. I would analyze the requirements first and then design a solution.`,
      },
      { Authorization: `Bearer ${token}` }
    );
    console.log(`  => Answered question ${i + 1}`);
  }
  console.log();

  /* 5. Finish interview -> triggers interview-scoring */
  console.log("[5] Finishing interview (triggers 'interview-scoring')...");
  const finish = await request("POST", `/api/interview/${interviewId}/finish`, null, {
    Authorization: `Bearer ${token}`,
  });
  if (!finish.body.success) throw new Error(`Finish failed: ${finish.body.message}`);
  console.log(`  => Interview finished. Status: ${finish.body.data.status}, Score: ${finish.body.data.overallScore}\n`);

  /* 6. Query AIUsageLog directly */
  console.log("[6] Querying AIUsageLog collection...");
  await mongoose.connect(MONGODB_URI);
  const AIUsageLog = require("../src/models/AIUsageLog.model");

  const logs = await AIUsageLog.find({
    userId: new mongoose.Types.ObjectId(userId),
    feature: { $in: ["interview-question-selection", "interview-scoring"] },
  }).sort({ createdAt: 1 });

  console.log(`  => Found ${logs.length} AIUsageLog entries for this user.\n`);

  const selectionLog = logs.find((l) => l.feature === "interview-question-selection");
  const scoringLog = logs.find((l) => l.feature === "interview-scoring");

  console.log("--- Verification Results ---");
  console.log(`interview-question-selection: ${selectionLog ? `success=${selectionLog.success}` : "NOT FOUND"}`);
  console.log(`interview-scoring:            ${scoringLog ? `success=${scoringLog.success}` : "NOT FOUND"}`);
  console.log();

  let allPassed = true;
  if (!selectionLog || !selectionLog.success) {
    console.error("FAIL: interview-question-selection log missing or not success=true");
    allPassed = false;
  }
  if (!scoringLog || !scoringLog.success) {
    console.error("FAIL: interview-scoring log missing or not success=true");
    allPassed = false;
  }

  if (allPassed) {
    console.log("✅ VERIFICATION PASSED: Both AIUsageLog entries exist with success=true.");
  } else {
    console.error("❌ VERIFICATION FAILED.");
    process.exit(1);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});
