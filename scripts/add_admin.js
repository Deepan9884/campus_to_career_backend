const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const path = require("path");

process.env.MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://careerforgeai:Deepan2005@careerforge-ai.8skj4z.mongodb.net/careerforge_ai?retryWrites=true&w=majority";
process.env.JWT_SECRET = process.env.JWT_SECRET || "C2C_Super_Secure_Jwt_Secret_Key_32_Chars_Long_2026!Aa1";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "C2C_Super_Secure_Jwt_Refresh_Secret_32_Chars_2026!Aa1";
process.env.RESET_TOKEN_SECRET = process.env.RESET_TOKEN_SECRET || "C2C_Super_Secure_Reset_Token_Secret_32_Chars_2026!Aa1";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");
const User = require("../src/models/User.model");

async function main() {
  console.log("Connecting to MongoDB Atlas...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB Atlas successfully!");

  const email = "s.saranya@eec.srmrmp.edu.in".toLowerCase().trim();
  const rawPassword = "123456";
  const hashedPassword = await bcryptjs.hash(rawPassword, 10);

  console.log(`Checking user with email: ${email}`);
  let user = await User.findOne({ email }).select("+password");

  if (user) {
    console.log(`Found existing user: ID=${user._id}, Role=${user.role}, Name=${user.name}`);
    user.role = "admin";
    user.password = hashedPassword;
    user.isEmailVerified = true;
    user.authProvider = "local";
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    console.log(`[SUCCESS] Updated existing user ${email} to role 'admin' with password '${rawPassword}'!`);
  } else {
    console.log(`Creating brand new admin user for ${email}...`);
    user = new User({
      name: "S. Saranya",
      email: email,
      password: hashedPassword,
      role: "admin",
      authProvider: "local",
      isEmailVerified: true,
      welcomeEmailSent: true,
    });
    await user.save();
    console.log(`[SUCCESS] Created new admin user: ID=${user._id}, Email=${email}, Role='admin', Password='${rawPassword}'!`);
  }

  // Verify credentials in database
  const verifiedUser = await User.findByEmail(email).select("+password");
  const isMatch = await bcryptjs.compare(rawPassword, verifiedUser.password);
  console.log(`Verification Check:
  - User ID: ${verifiedUser._id}
  - Email: ${verifiedUser.email}
  - Role: ${verifiedUser.role}
  - Auth Provider: ${verifiedUser.authProvider}
  - Email Verified: ${verifiedUser.isEmailVerified}
  - Password Valid (123456): ${isMatch}`);

  await mongoose.disconnect();
  console.log("Database connection closed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error setting admin user:", err);
  process.exit(1);
});
