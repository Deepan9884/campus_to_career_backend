const compilerService = require("../services/compiler.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const runCode = asyncHandler(async (req, res) => {
  const { code, language, testCases, customInput, questionText } = req.body;

  if (!code || typeof code !== "string") {
    throw ApiError.badRequest("Code is required for execution");
  }

  // Support custom input execution: if customInput is provided, treat it as a custom test case
  let testCasesToRun = Array.isArray(testCases) ? testCases : [];
  if (typeof customInput === "string" && customInput.trim().length > 0) {
    testCasesToRun = [
      {
        id: "custom",
        input: customInput.trim(),
        expectedOutput: "(Custom)",
        description: "Custom Playground Input",
      },
    ];
  }

  const result = await compilerService.executeCode({
    code,
    language: language || "python",
    testCases: testCasesToRun,
    questionText: questionText || "",
    userId: req.user?._id,
  });

  return res.status(200).json(new ApiResponse(200, result, "Code execution completed"));
});

module.exports = {
  runCode,
};
