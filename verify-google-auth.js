const mongoose = require("mongoose");
const env = require("./src/config/env");
const User = require("./src/models/User.model");

const crypto = require("crypto");

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to DB");

  try {
    // 1. Create a dummy google account (Simulate Google Auth New User)
    const randomPassword = crypto.randomBytes(32).toString("hex") + "Aa1!";
    const newGoogleUser = await User.create({
      name: "Google User",
      email: "google.only@example.com",
      password: randomPassword,
      googleId: "google-123",
      authProvider: "google",
    });
    console.log("Created Google User:", newGoogleUser.email, "Provider:", newGoogleUser.authProvider);

    // 2. Create a local account (Simulate existing local user)
    const localUser = await User.create({
      name: "Local User",
      email: "local.user@example.com",
      password: "StrongPassword123!",
      authProvider: "local",
    });
    console.log("Created Local User:", localUser.email, "Provider:", localUser.authProvider);

    // 3. Simulate auto-linking (Simulate Google Auth Existing User)
    localUser.googleId = "google-456";
    if (localUser.authProvider === "local") {
      localUser.authProvider = "both";
    }
    await localUser.save();
    console.log("Auto-linked Local User. New Provider:", localUser.authProvider, "GoogleID:", localUser.googleId);

    // Cleanup
    await User.deleteMany({ email: { $in: ["google.only@example.com", "local.user@example.com"] } });
    console.log("Test passed and cleaned up");
  } catch (err) {
    console.error("Test failed:", err);
  }

  await mongoose.disconnect();
}

run();
