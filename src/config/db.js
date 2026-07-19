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

const connectDB = async () => {
  if (!env.MONGODB_URI) {
    console.error("[db] MONGODB_URI is not set — server will start without database connectivity");
    return;
  }

  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      maxPoolSize: 20,
    });
    console.log(`[db] Connected to MongoDB: ${conn.connection.host}/${conn.connection.name}`);
  } catch (err) {
    console.error("[db] Initial connection failed:", err.message);
    console.error("[db] Will retry automatically — server is accepting HTTP requests in the meantime");
  }
};

module.exports = connectDB;
module.exports.getDbStatus = getDbStatus;
