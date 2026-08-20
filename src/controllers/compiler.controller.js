const compilerService = require("../services/compiler.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");

const runCode = asyncHandler(async (req, res) => {
  const { code, language, testCases, questionText } = req.body;

  if (!code || typeof code !== "string") {
    throw ApiError.badRequest("Code is required for execution");
  }

  const result = await compilerService.executeCode({
    code,
    language: language || "python",
    testCases: Array.isArray(testCases) ? testCases : [],
    questionText: questionText || "",
  });

  return res.status(200).json(new ApiResponse(200, result, "Code execution completed"));
});

module.exports = {
  runCode,
};
