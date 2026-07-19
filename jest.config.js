module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  testTimeout: 30000,
  verbose: true,
  collectCoverageFrom: [
    "src/controllers/auth.controller.js",
    "src/routes/auth.routes.js",
    "src/models/User.model.js",
    "src/middleware/auth.middleware.js",
  ],
  coverageDirectory: "coverage",
  moduleFileExtensions: ["js", "json"],
  transform: {},
};