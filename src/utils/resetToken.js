const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../config/env");

const PURPOSE = "password-reset";
const EXPIRES_IN = "15m";

function getPasswordFragment(passwordHash) {
  return crypto.createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

function generateResetToken(user) {
  const payload = {
    userId: user._id.toString(),
    purpose: PURPOSE,
    pwFragment: getPasswordFragment(user.password),
  };
  return jwt.sign(payload, env.RESET_TOKEN_SECRET, { expiresIn: EXPIRES_IN });
}

function verifyResetToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, env.RESET_TOKEN_SECRET);
  } catch {
    return null;
  }

  if (!decoded || decoded.purpose !== PURPOSE) {
    return null;
  }

  return decoded;
}

module.exports = { generateResetToken, verifyResetToken, getPasswordFragment };
