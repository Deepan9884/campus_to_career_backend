const { parseCodingProblemFromUrl } = require("../src/services/questionBank.service");

(async () => {
  console.log("--- TEST 1: LeetCode URL ---");
  const p1 = await parseCodingProblemFromUrl("https://leetcode.com/problems/longest-palindromic-substring/");
  console.log("Title:", p1.title);
  console.log("Difficulty:", p1.difficulty);
  console.log("Constraints:", p1.constraints);
  console.log("Test cases count:", p1.testCases?.length);
  console.log("First test case:", p1.testCases?.[0]);
  console.log("Starter codes check (python):", JSON.stringify(p1.starterCodes?.python));

  console.log("\n--- TEST 2: LeetCode URL 2 (Add Two Numbers) ---");
  const p2 = await parseCodingProblemFromUrl("https://leetcode.com/problems/add-two-numbers/");
  console.log("Title:", p2.title);
  console.log("Difficulty:", p2.difficulty);
  console.log("Test cases count:", p2.testCases?.length);
  console.log("First test case:", p2.testCases?.[0]);

  console.log("\n--- TEST 3: LeetCode URL 3 (Two Sum) ---");
  const p3 = await parseCodingProblemFromUrl("https://leetcode.com/problems/two-sum/");
  console.log("Title:", p3.title);
  console.log("Test cases count:", p3.testCases?.length);
})();
