/**
 * Jest test setup for auth module integration tests.
 * Sets up a test MongoDB connection and provides utilities for tests.
 */

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

/**
 * Connect to an in-memory MongoDB instance for testing.
 * Uses mongodb-memory-server to spin up a temporary MongoDB instance.
 */
async function connectTestDB() {
  // Set NODE_ENV to test to skip morgan logging and use test DB
  process.env.NODE_ENV = "test";

  // Start in-memory MongoDB
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // Override the MONGODB_URI for tests
  process.env.MONGODB_URI = uri;

  // Connect mongoose
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  console.log("[test] Connected to in-memory MongoDB:", uri);
}

/**
 * Disconnect and stop the in-memory MongoDB instance.
 */
async function disconnectTestDB() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) {
    await mongod.stop();
  }
  console.log("[test] Disconnected from in-memory MongoDB");
}

/**
 * Clear all collections in the test database.
 * Useful for cleaning up between test suites.
 */
async function clearTestDB() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

/**
 * Generate a unique test email to avoid collisions.
 */
function generateTestEmail(prefix = "test") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Valid test user payload for registration.
 */
function getValidUserPayload(overrides = {}) {
  return {
    name: "Test User",
    email: generateTestEmail(),
    password: "TestPass123!",
    ...overrides,
  };
}

module.exports = {
  connectTestDB,
  disconnectTestDB,
  clearTestDB,
  generateTestEmail,
  getValidUserPayload,
};