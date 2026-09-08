require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User.model');

const bcryptjs = require("bcryptjs");

async function makeAdmin() {
  const email = (process.argv[2] || "").toLowerCase().trim();
  const password = process.argv[3];
  if (!email) {
    console.error("Usage: node scripts/createAdmin.js <email> [password]");
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Missing MONGODB_URI in environment");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  let user = await User.findOne({ email });
  if (!user) {
    const rawPass = password || "123456";
    const hashedPassword = await bcryptjs.hash(rawPass, 10);
    user = new User({
      name: email.split("@")[0].replace(/[\._]/g, " ").toUpperCase(),
      email,
      password: hashedPassword,
      role: "admin",
      authProvider: "local",
      isEmailVerified: true,
      welcomeEmailSent: true,
    });
    await user.save();
    console.log(`Created new ADMIN user: ${user.email} (Password: ${rawPass})`);
  } else {
    user.role = "admin";
    if (password) {
      user.password = await bcryptjs.hash(password, 10);
      user.authProvider = "local";
    }
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    console.log(`SUCCESS! User ${user.name} (${user.email}) has been granted ADMIN role!`);
  }

  await mongoose.disconnect();
}

makeAdmin().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
