const nodemailer = require("nodemailer");
const env = require("../config/env");

let transporter = null;
let devMode = false;

function initEmailService() {
  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    devMode = true;
    console.warn(
      "⚠️  SMTP not configured — password reset emails will be logged to console instead of sent",
    );
    return;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(port, 10),
    secure: parseInt(port, 10) === 465,
    auth: { user, pass },
  });

  devMode = false;
}

async function sendPasswordResetEmail(email, resetLink) {
  if (devMode || !transporter) {
    console.log(`[DEV MODE — EMAIL NOT SENT] Password reset link for ${email}: ${resetLink}`);
    return;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to: email,
    subject: "CareerForge AI — Password Reset",
    html: `
      <p>You requested a password reset.</p>
      <p>Click the link below to reset your password. This link expires in 15 minutes.</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

initEmailService();

module.exports = { sendPasswordResetEmail };
