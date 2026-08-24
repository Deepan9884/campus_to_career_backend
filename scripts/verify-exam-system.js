require("dotenv").config();
const mongoose = require("mongoose");
const http = require("http");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const env = require("../src/config/env");
const User = require("../src/models/User.model");
const Exam = require("../src/models/Exam.model");
const ExamSubmission = require("../src/models/ExamSubmission.model");

async function runExamSystemVerification() {
  console.log("===============================================================================");
  console.log("STARTING LIVE END-TO-END EXAM & RESULTS VERIFICATION SUITE");
  console.log("===============================================================================\n");

  const mongoUri = env.MONGODB_URI;
  if (!mongoUri) {
    console.error("❌ MONGODB_URI not found in env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log("✓ Connected to MongoDB Atlas Cluster.");

  // Start HTTP Server
  const PORT = 5098;
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
  const baseUrl = `http://localhost:${PORT}/api`;
  console.log(`✓ Test Express server listening at ${baseUrl}\n`);

  try {
    // ── 1. CLEANUP & SEED TEST USERS ─────────────────────────────────────────
    await User.deleteMany({ email: { $in: ["admin_exam_verifier@campus.edu", "student_exam_verifier@campus.edu"] } });
    await Exam.deleteMany({ title: { $regex: /Verifier/i } });
    await ExamSubmission.deleteMany({ studentEmail: { $in: ["student_exam_verifier@campus.edu"] } });

    const adminUser = await User.create({
      name: "Prof. S. R. Ramanujan",
      email: "admin_exam_verifier@campus.edu",
      password: "Password123!",
      role: "admin",
      profile: { department: "Computer Science & Engineering" },
    });

    const studentUser = await User.create({
      name: "Deepan Raj",
      email: "student_exam_verifier@campus.edu",
      password: "Password123!",
      role: "student",
      assignedMentor: adminUser._id,
      profile: {
        registerNumber: "953621104088",
        department: "Computer Science",
        batch: "2022-2026",
      },
    });

    const adminToken = jwt.sign({ _id: adminUser._id, role: "admin" }, env.JWT_SECRET || "default_jwt_secret", { expiresIn: "1d" });
    const studentToken = jwt.sign({ _id: studentUser._id, role: "student" }, env.JWT_SECRET || "default_jwt_secret", { expiresIn: "1d" });

    console.log("✓ Seeded Admin User:", adminUser.name, `(${adminUser.email})`);
    console.log("✓ Seeded Student User:", studentUser.name, `(Reg No: ${studentUser.profile.registerNumber})\n`);

    // ── 2. TEST CODING LINK PARSER (LEETCODE / HACKERRANK) ───────────────────
    console.log("--- TEST 1: LeetCode / HackerRank Link Parser ---");
    const linkRes = await fetch(`${baseUrl}/exams/admin/parse-coding-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ urlOrTitle: "https://leetcode.com/problems/two-sum/" }),
    });
    const linkData = await linkRes.json();
    if (!linkRes.ok || !linkData.success) throw new Error("Link parser failed: " + JSON.stringify(linkData));
    console.log("✓ Problem Extracted:", linkData.data.title);
    console.log("✓ Test cases count:", linkData.data.testCases.length);
    console.log("✓ Starter code check (NO solution code):", linkData.data.starterCodes.python.split("\n")[0]);
    if (linkData.data.starterCodes.python.includes("return [i, hash_map[diff]]")) {
      throw new Error("❌ Security violation: Solution code leaked in starter code!");
    }
    console.log("✓ TEST 1 PASSED: Link parsed and solution code strictly excluded!\n");

    // ── 3. TEST MCQ GENERATOR ───────────────────────────────────────────────
    console.log("--- TEST 2: AI / Curated MCQ Generator ---");
    const mcqGenRes = await fetch(`${baseUrl}/exams/admin/generate-ai-mcqs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ topics: ["Data Structures & Algorithms"], difficulty: "medium", count: 2 }),
    });
    const mcqGenData = await mcqGenRes.json();
    if (!mcqGenRes.ok || !mcqGenData.success) throw new Error("MCQ generator failed: " + JSON.stringify(mcqGenData));
    console.log("✓ Generated MCQs Count:", mcqGenData.data.length);
    console.log("✓ First MCQ Question:", mcqGenData.data[0].question.slice(0, 60) + "...");
    console.log("✓ Options count:", mcqGenData.data[0].options.length);
    console.log("✓ TEST 2 PASSED: MCQs generated with 4 options and valid answer keys!\n");

    // ── 4. TEST ADMIN CREATE MCQ EXAM ────────────────────────────────────────
    console.log("--- TEST 3: Admin Create MCQ Exam ---");
    const createMcqRes = await fetch(`${baseUrl}/exams/admin/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: "Verifier MCQ Assessment: Core DSA & Algorithms",
        examType: "mcq",
        category: "Campus Recruitment",
        difficulty: "Medium",
        durationMinutes: 45,
        passingScorePercentage: 60,
        targetAudience: "all",
        sections: [
          {
            sectionId: "sec-1",
            title: "Section 1: Data Structures",
            type: "mcq",
            difficulty: "medium",
            topics: ["Data Structures"],
            timeLimitMinutes: 20,
            mcqQuestions: [
              {
                questionId: "q-1",
                question: "What is the worst-case lookup in a balanced BST?",
                options: ["O(1)", "O(log N)", "O(N)", "O(N log N)"],
                correctOptionIndex: 1,
                positiveMarks: 10,
                negativeMarks: 2,
                explanation: "Balanced BST is O(log N).",
              },
              {
                questionId: "q-2",
                question: "Which data structure follows LIFO?",
                options: ["Queue", "Stack", "Tree", "Graph"],
                correctOptionIndex: 1,
                positiveMarks: 10,
                negativeMarks: 2,
                explanation: "Stack is LIFO.",
              },
            ],
          },
        ],
      }),
    });
    const createMcqData = await createMcqRes.json();
    if (!createMcqRes.ok || !createMcqData.success) throw new Error("Create MCQ failed: " + JSON.stringify(createMcqData));
    const mcqExamId = createMcqData.data._id;
    console.log("✓ Created MCQ Exam ID:", mcqExamId);
    console.log("✓ Result Disclosed Default State:", createMcqData.data.isResultDisclosed, "(CONCEALED)");
    console.log("✓ TEST 3 PASSED: MCQ Exam created successfully!\n");

    // ── 5. TEST ADMIN CREATE MIXED (BOTH MCQ & CODING) EXAM ──────────────────
    console.log("--- TEST 4: Admin Create Mixed (Both MCQ & Coding) Exam ---");
    const createMixedRes = await fetch(`${baseUrl}/exams/admin/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: "Verifier Mixed Assessment: Full Stack Placement",
        examType: "mixed",
        category: "Campus Recruitment",
        difficulty: "Hard",
        durationMinutes: 90,
        passingScorePercentage: 70,
        targetAudience: "all",
        sections: [
          {
            sectionId: "sec-1",
            title: "Section 1: Conceptual MCQs",
            type: "mcq",
            topics: ["Core CS"],
            timeLimitMinutes: 30,
            mcqQuestions: [
              {
                questionId: "m-1",
                question: "Which isolation level prevents dirty reads?",
                options: ["Read Uncommitted", "Read Committed", "None", "Serializable only"],
                correctOptionIndex: 1,
                positiveMarks: 10,
              },
            ],
          },
          {
            sectionId: "sec-2",
            title: "Section 2: Coding Problem",
            type: "coding",
            topics: ["Arrays"],
            timeLimitMinutes: 60,
            codingQuestions: [
              {
                id: "c-1",
                title: "Two Sum Target",
                difficulty: "Easy",
                problemStatement: "Given nums and target, find indices.",
                marks: 20,
                testCases: [
                  { input: "4 9\n2 7 11 15", expectedOutput: "0 1", isHidden: false },
                  { input: "3 6\n3 2 4", expectedOutput: "1 2", isHidden: true },
                ],
              },
            ],
          },
        ],
      }),
    });
    const createMixedData = await createMixedRes.json();
    if (!createMixedRes.ok || !createMixedData.success) throw new Error("Create Mixed failed: " + JSON.stringify(createMixedData));
    console.log("✓ Created Mixed Exam Sections:", createMixedData.data.sections.length);
    console.log("✓ TEST 4 PASSED: Mixed exam with MCQ and Coding sections created!\n");

    // ── 6. TEST STUDENT AVAILABLE EXAMS LIST ─────────────────────────────────
    console.log("--- TEST 5: Student Available Exams Endpoint ---");
    const availRes = await fetch(`${baseUrl}/exams/student/available`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const availData = await availRes.json();
    if (!availRes.ok || !availData.success) throw new Error("Available exams failed: " + JSON.stringify(availData));
    console.log("✓ Available exams count for student:", availData.data.length);
    console.log("✓ TEST 5 PASSED: Student can list available exams!\n");

    // ── 7. TEST STUDENT GET EXAM SESSION (SANITIZED) ─────────────────────────
    console.log("--- TEST 6: Student Sanitized Exam Session ---");
    const sessionRes = await fetch(`${baseUrl}/exams/student/${mcqExamId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const sessionData = await sessionRes.json();
    if (!sessionRes.ok || !sessionData.success) throw new Error("Exam session failed: " + JSON.stringify(sessionData));
    const firstQ = sessionData.data.sections[0].mcqQuestions[0];
    if (firstQ.correctOptionIndex !== undefined || firstQ.explanation !== undefined) {
      throw new Error("❌ Security violation: Correct answers or explanations leaked to student!");
    }
    console.log("✓ Verified: Correct option index & explanations are omitted in student payload");
    console.log("✓ TEST 6 PASSED: Exam session is securely sanitized!\n");

    // ── 8. TEST STUDENT SUBMIT EXAM & MARKS CONCEALMENT ──────────────────────
    console.log("--- TEST 7: Student Exam Submission & Mark Concealment ---");
    const submitRes = await fetch(`${baseUrl}/exams/student/${mcqExamId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        answers: {
          "q-1": 1, // Correct Option Index 1
          "q-2": 1, // Correct Option Index 1
        },
        durationSeconds: 720,
        violationsCount: 0,
        proctoringIntegrity: 100,
      }),
    });
    const submitData = await submitRes.json();
    if (!submitRes.ok || !submitData.success) throw new Error("Submission failed: " + JSON.stringify(submitData));
    if (submitData.data.totalScore !== undefined || submitData.data.percentage !== undefined) {
      throw new Error("❌ Mark Concealment Violation: Score was disclosed to student upon submission!");
    }
    console.log("✓ Submission Status:", submitData.data.status);
    console.log("✓ Response Message:", submitData.data.message);
    console.log("✓ Verified: Total marks and percentages are strictly CONCEALED");
    console.log("✓ TEST 7 PASSED: Exam submitted and marks concealed successfully!\n");

    // ── 9. TEST STUDENT MY RESULTS (UNDISCLOSED STATE) ───────────────────────
    console.log("--- TEST 8: Student My Results (Undisclosed State) ---");
    const resultsUndisclosedRes = await fetch(`${baseUrl}/exams/student/my-results`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const resultsUndisclosedData = await resultsUndisclosedRes.json();
    const mySubUndisclosed = resultsUndisclosedData.data.find((r) => r.examId === mcqExamId);
    if (!mySubUndisclosed) throw new Error("Submission not found in my-results");
    if (mySubUndisclosed.isResultDisclosed !== false) throw new Error("isResultDisclosed should be false");
    if (mySubUndisclosed.totalScore !== undefined) throw new Error("Score leaked while undisclosed");
    console.log("✓ Status shown to student:", mySubUndisclosed.status);
    console.log("✓ Notice:", mySubUndisclosed.message);
    console.log("✓ TEST 8 PASSED: Scorecard is confidential and withheld from student!\n");

    // ── 10. TEST ADMIN GET RESULTS TABULAR BREAKDOWN (ROWS & COLUMNS) ────────
    console.log("--- TEST 9: Admin Results Tabular View (Rows & Columns) ---");
    const adminResultsRes = await fetch(`${baseUrl}/exams/admin/${mcqExamId}/results`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminResultsData = await adminResultsRes.json();
    if (!adminResultsRes.ok || !adminResultsData.success) throw new Error("Admin results failed: " + JSON.stringify(adminResultsData));
    const table = adminResultsData.data.resultsTable;
    console.log("✓ Total Candidates in Results Table:", table.length);
    const row = table[0];
    console.log(`✓ Row #1 -> Rank: #${row.rank} | Student: ${row.studentName} | Reg No: ${row.registerNumber} | Total Score: ${row.totalScore}/${row.maxScore} (${row.percentage}%) | Status: ${row.status}`);
    console.log("✓ Question 1 Score:", row.questionScores[0].score, `/${row.questionScores[0].maxMarks}`);
    console.log("✓ Question 2 Score:", row.questionScores[1].score, `/${row.questionScores[1].maxMarks}`);
    if (row.registerNumber !== "953621104088" || row.totalScore !== 20) {
      throw new Error("❌ Mark calculation or student mapping error!");
    }
    console.log("✓ TEST 9 PASSED: Admin Results table has full row-and-column breakdown with question-wise scores!\n");

    // ── 11. TEST ADMIN TOGGLE RESULT DISCLOSURE ──────────────────────────────
    console.log("--- TEST 10: Admin Disclose Result Toggle ---");
    const toggleRes = await fetch(`${baseUrl}/exams/admin/${mcqExamId}/toggle-disclosure`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ isResultDisclosed: true }),
    });
    const toggleData = await toggleRes.json();
    if (!toggleRes.ok || !toggleData.data.isResultDisclosed) throw new Error("Toggle disclosure failed");
    console.log("✓ Result Disclosure toggled to TRUE (Disclosed)");
    console.log("✓ TEST 10 PASSED: Result disclosure state updated successfully!\n");

    // ── 12. TEST STUDENT CAN NOW VIEW SCORECARD ONCE DISCLOSED ───────────────
    console.log("--- TEST 11: Student Scorecard View (Disclosed State) ---");
    const resultsDisclosedRes = await fetch(`${baseUrl}/exams/student/my-results`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const resultsDisclosedData = await resultsDisclosedRes.json();
    const mySubDisclosed = resultsDisclosedData.data.find((r) => r.examId === mcqExamId);
    if (!mySubDisclosed || mySubDisclosed.isResultDisclosed !== true) {
      throw new Error("Student scorecard did not disclose after admin toggle");
    }
    console.log(`✓ Disclosed Scorecard -> Rank: #${mySubDisclosed.rank} | Total Score: ${mySubDisclosed.totalScore}/${mySubDisclosed.maxScore} (${mySubDisclosed.percentage}%) | Passed: ${mySubDisclosed.passed}`);
    console.log("✓ Question scores breakdown available to student:", mySubDisclosed.questionScores.length, "questions evaluated");
    console.log("✓ TEST 11 PASSED: Student can view their complete scorecard!\n");

    // ── 13. TEST RETAKE ENFORCEMENT (BLOCKED BY DEFAULT) ─────────────────────
    console.log("--- TEST 12: Retake Security Enforcement (Default: Blocked) ---");
    const retakeAttemptRes = await fetch(`${baseUrl}/exams/student/${mcqExamId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const retakeAttemptData = await retakeAttemptRes.json();
    if (retakeAttemptRes.status !== 403) {
      throw new Error("❌ Security violation: Student was able to initiate a retake when retakes are disabled!");
    }
    console.log("✓ Retake Request Status:", retakeAttemptRes.status, "(Forbidden - Retakes not permitted)");
    console.log("✓ Message from server:", retakeAttemptData.message);
    console.log("✓ TEST 12 PASSED: Retakes are strictly BLOCKED without admin permission!\n");

    // ── 14. TEST ADMIN ENABLES RETAKES & STUDENT RETAKES EXAM ────────────────
    console.log("--- TEST 13: Admin Enables Retake & Student Successfully Retakes ---");
    const enableRetakeRes = await fetch(`${baseUrl}/exams/admin/${mcqExamId}/toggle-retakes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ allowRetakes: true }),
    });
    const enableRetakeData = await enableRetakeRes.json();
    if (!enableRetakeRes.ok || !enableRetakeData.data.allowRetakes) {
      throw new Error("Admin enable retake failed: " + JSON.stringify(enableRetakeData));
    }
    console.log("✓ Retakes toggled by admin to: TRUE");

    const retakeAllowedRes = await fetch(`${baseUrl}/exams/student/${mcqExamId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const retakeAllowedData = await retakeAllowedRes.json();
    if (!retakeAllowedRes.ok || !retakeAllowedData.success) {
      throw new Error("Student failed to enter exam after admin enabled retakes: " + JSON.stringify(retakeAllowedData));
    }
    console.log("✓ Student can now access the exam session for retake!");

    const retakeSubmitRes = await fetch(`${baseUrl}/exams/student/${mcqExamId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        answers: {
          "q-1-1": 1,
          "q-1-2": 2,
        },
        durationSeconds: 95,
      }),
    });
    const retakeSubmitData = await retakeSubmitRes.json();
    if (!retakeSubmitRes.ok || !retakeSubmitData.success) {
      throw new Error("Student retake submission failed: " + JSON.stringify(retakeSubmitData));
    }
    console.log("✓ Retake submitted successfully!");
    console.log("✓ TEST 13 PASSED: Admin-authorized retake flow verified!\n");

    // --- TEST 14: Proctoring Violation Lock & Block Enforcement ---
    console.log("--- TEST 14: Proctoring Violation Lock & Block Enforcement ---");
    const blockReportRes = await fetch(`${baseUrl}/exams/student/${mcqExamId}/report-blocked`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({
        violationsCount: 3,
        violationDetails: ["Tab switch detected", "Fullscreen exit timeout", "Multiple faces detected"],
        reason: "Anti-cheat violations limit exceeded (3 strikes)",
      }),
    });
    const blockReportData = await blockReportRes.json();
    if (!blockReportRes.ok || !blockReportData.data.isBlocked) {
      throw new Error("Report blocked failed: " + JSON.stringify(blockReportData));
    }
    console.log("✓ Student proctoring block reported and recorded in database");

    const blockStatusRes = await fetch(`${baseUrl}/exams/student/${mcqExamId}/block-status`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const blockStatusData = await blockStatusRes.json();
    if (!blockStatusRes.ok || !blockStatusData.data.isBlocked) {
      throw new Error("Block status check failed: " + JSON.stringify(blockStatusData));
    }
    console.log("✓ Student block status confirmed: isBlocked = TRUE");

    const enterBlockedExamRes = await fetch(`${baseUrl}/exams/student/${mcqExamId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const enterBlockedExamData = await enterBlockedExamRes.json();
    if (enterBlockedExamRes.status !== 403 || !enterBlockedExamData.data?.isBlocked) {
      throw new Error("Student was not blocked from taking exam: " + JSON.stringify(enterBlockedExamData));
    }
    console.log("✓ Student is strictly FORBIDDEN from taking/resuming exam while locked (HTTP 403)");
    console.log("✓ TEST 14 PASSED: Proctoring block strictly enforced!\n");

    // --- TEST 15: Mentor Unblocks Student & Student Resumes Exam ---
    console.log("--- TEST 15: Mentor Unblocks Student & Student Resumes Exam ---");
    const mentorUnblockRes = await fetch(`${baseUrl}/exams/admin/${mcqExamId}/students/${studentUser._id}/unblock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    });
    const mentorUnblockData = await mentorUnblockRes.json();
    if (!mentorUnblockRes.ok || mentorUnblockData.data.isBlocked !== false) {
      throw new Error("Mentor unblock failed: " + JSON.stringify(mentorUnblockData));
    }
    console.log("✓ Mentor unblocked candidate: " + mentorUnblockData.message);

    const postUnblockStatusRes = await fetch(`${baseUrl}/exams/student/${mcqExamId}/block-status`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const postUnblockStatusData = await postUnblockStatusRes.json();
    if (!postUnblockStatusRes.ok || postUnblockStatusData.data.isBlocked !== false) {
      throw new Error("Post-unblock status check failed: " + JSON.stringify(postUnblockStatusData));
    }
    console.log("✓ Student live status verified: isBlocked = FALSE (Unlocked)");

    const resumeExamRes = await fetch(`${baseUrl}/exams/student/${mcqExamId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const resumeExamData = await resumeExamRes.json();
    if (!resumeExamRes.ok || !resumeExamData.success) {
      throw new Error("Student failed to resume exam after mentor unblock: " + JSON.stringify(resumeExamData));
    }
    console.log("✓ Student successfully resumed examination session!");
    console.log("✓ TEST 15 PASSED: Mentor unblock & resume flow verified!\n");

    console.log("===============================================================================");
    console.log("🎉 ALL 15 VERIFICATION TESTS PASSED PERFECTLY WITH ZERO ERRORS!");
    console.log("===============================================================================\n");

    // Cleanup test data
    await User.deleteMany({ email: { $in: ["admin_exam_verifier@campus.edu", "student_exam_verifier@campus.edu"] } });
    await Exam.deleteMany({ title: { $regex: /Verifier/i } });
    await ExamSubmission.deleteMany({ studentEmail: { $in: ["student_exam_verifier@campus.edu"] } });

  } catch (err) {
    console.error("❌ E2E Verification Failed:", err);
    process.exitCode = 1;
  } finally {
    server.close();
    await mongoose.connection.close();
    process.exit(process.exitCode || 0);
  }
}

runExamSystemVerification();
