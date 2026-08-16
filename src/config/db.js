const mongoose = require("mongoose");
const dns = require("dns");
const env = require("./env");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

mongoose.set("strictQuery", true);

let dbStatus = {
  state: "disconnected",
  lastChangedAt: new Date(),
  lastError: null,
};

function getMongooseState(readyState) {
  switch (readyState) {
    case 0:
      return "disconnected";
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "unknown";
  }
}

mongoose.connection.on("connected", () => {
  dbStatus = { state: "connected", lastChangedAt: new Date(), lastError: null };
  console.log("[db] Event: connected");
});

mongoose.connection.on("error", (err) => {
  dbStatus = { state: "error", lastChangedAt: new Date(), lastError: err.message };
  console.error("[db] Event: error —", err.message);
});

mongoose.connection.on("disconnected", () => {
  dbStatus = { state: "disconnected", lastChangedAt: new Date(), lastError: null };
  console.warn("[db] Event: disconnected");
});

mongoose.connection.on("reconnected", () => {
  dbStatus = { state: "connected", lastChangedAt: new Date(), lastError: null };
  console.log("[db] Event: reconnected");
});

function getDbStatus() {
  const realState = getMongooseState(mongoose.connection.readyState);
  return {
    state: realState,
    lastChangedAt: dbStatus.lastChangedAt,
    lastError: realState === "error" ? dbStatus.lastError : null,
  };
}

let mongodInstance = null;

async function autoSeedIfEmpty() {
  try {
    const RoleSkill = require("../models/RoleSkill.model");
    const Question = require("../models/Question.model");

    const roleCount = await RoleSkill.countDocuments();
    if (roleCount === 0) {
      console.log("[db] Auto-seeding initial role skills...");
      const { seed: seedRoleSkills } = require("../../scripts/seedRoleSkills");
      if (typeof seedRoleSkills === "function") {
        await seedRoleSkills();
      }
    }

    const questionCount = await Question.countDocuments();
    if (questionCount === 0) {
      console.log("[db] Auto-seeding initial questions...");
      const { seed: seedQuestions } = require("../../scripts/seedQuestions");
      if (typeof seedQuestions === "function") {
        await seedQuestions();
      }
    }
  } catch (err) {
    console.warn("[db] Auto-seed non-fatal note:", err.message);
  }
}

const connectDB = async () => {
  if (!env.MONGODB_URI && env.NODE_ENV !== "production") {
    try {
      console.log("[db] No MONGODB_URI set. Starting In-Memory MongoDB server for development...");
      const { MongoMemoryServer } = require("mongodb-memory-server");
      mongodInstance = await MongoMemoryServer.create();
      const uri = mongodInstance.getUri();
      const conn = await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 15000,
      });
      console.log(`[db] Connected to In-Memory MongoDB: ${conn.connection.host}/${conn.connection.name}`);
      await autoSeedIfEmpty();
      return;
    } catch (memErr) {
      console.error("[db] Failed to start In-Memory MongoDB:", memErr.message);
      return;
    }
  }

  if (!env.MONGODB_URI) {
    console.error("[db] MONGODB_URI is not set — server will start without database connectivity");
    return;
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[db] Connecting to MongoDB (attempt ${attempt}/${maxRetries})...`);
      const conn = await mongoose.connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 20000,
        maxPoolSize: 20,
      });
      console.log(`[db] Connected to MongoDB: ${conn.connection.host}/${conn.connection.name}`);
      await autoSeedIfEmpty();
      return;
    } catch (err) {
      console.warn(`[db] Connection attempt ${attempt} failed:`, err.message);
      if (attempt < maxRetries) {
        console.log("[db] Retrying in 2 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        console.error("[db] Could not connect to MongoDB Atlas after retries. Will keep trying in background...");
      }
    }
  }
};

module.exports = connectDB;
module.exports.getDbStatus = getDbStatus;
