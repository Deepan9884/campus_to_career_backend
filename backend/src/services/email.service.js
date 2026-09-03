const nodemailer = require("nodemailer");
const env = require("../config/env");

let transporter = null;
let devMode = false;

function initEmailService() {
  const host = env.SMTP_HOST || "smtp.gmail.com";
  const port = env.SMTP_PORT || "587";
  const user = env.SMTP_USER || "campustocareer25@gmail.com";
  const pass = env.SMTP_PASS || "zjyeqegzjembcjty";

  if (!user || !pass) {
    devMode = true;
    console.warn(
      "⚠️  SMTP not fully configured — emails will be logged to console instead of sent",
    );
    return;
  }

  // Use service: 'gmail' for Gmail for maximum reliability across cloud hosts
  if (host.includes("gmail") || user.endsWith("@gmail.com")) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });
  } else {
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: parseInt(port, 10) === 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  devMode = false;
  console.log(`[Email Service] SMTP initialized for ${user}`);
}

/**
 * Parses user agent string to human-friendly device & browser name
 */
function parseUserAgent(ua = "") {
  if (!ua) return "Unknown Device / Browser";
  let browser = "Web Browser";
  let os = "Desktop";

  if (/Mobile|Android|iP(hone|od)/i.test(ua)) os = "Mobile Device";
  else if (/iPad|Tablet/i.test(ua)) os = "Tablet";
  else if (/Windows/i.test(ua)) os = "Windows PC";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "Mac";
  else if (/Linux/i.test(ua)) os = "Linux";

  if (/Edg/i.test(ua)) browser = "Microsoft Edge";
  else if (/Chrome/i.test(ua)) browser = "Google Chrome";
  else if (/Firefox/i.test(ua)) browser = "Mozilla Firefox";
  else if (/Safari/i.test(ua)) browser = "Apple Safari";
  else if (/MSIE|Trident/i.test(ua)) browser = "Internet Explorer";

  return `${browser} on ${os}`;
}

/**
 * Formats a clean sender address and anti-spam deliverability headers.
 */
function getMailOptions({ to, subject, html, text, customHeaders = {} }) {
  const senderEmail = env.SMTP_USER || "campustocareer25@gmail.com";
  let from = env.SMTP_FROM || `"Campus to Career AI" <${senderEmail}>`;

  if (typeof from === "string") {
    const clean = from.replace(/['"]/g, "").trim();
    const match = clean.match(/^(.*?)\s*<([^>]+)>/);
    if (match) {
      from = `"${match[1].trim() || "Campus to Career AI"}" <${match[2].trim()}>`;
    } else if (clean.includes("@")) {
      from = `"Campus to Career AI" <${clean}>`;
    }
  }

  return {
    from,
    to,
    replyTo: senderEmail,
    subject,
    text: text || html.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim(),
    html,
    headers: {
      "X-Mailer": "CampusToCareer-Platform-Mailer",
      "X-Auto-Response-Suppress": "OOF, AutoReply",
      "Auto-Submitted": "auto-generated",
      "List-Unsubscribe": `<mailto:${senderEmail}?subject=unsubscribe>`,
      ...customHeaders,
    },
  };
}

/**
 * Universal email dispatcher:
 * 1. Resend HTTP API  — from: onboarding@resend.dev, reply-to: campustocareer25@gmail.com (works immediately)
 * 2. Brevo HTTP API   — from: campustocareer25@gmail.com (needs sender verified in Brevo dashboard)
 * 3. Nodemailer SMTP  — localhost & environments with open SMTP ports
 */
async function sendMailPayload(opts) {
  const SENDER_EMAIL = env.SMTP_USER || "campustocareer25@gmail.com";
  const SENDER_NAME  = "Campus to Career AI";

  // 1. Resend HTTP API — works immediately (free tier only allows from onboarding@resend.dev)
  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:     `${SENDER_NAME} <onboarding@resend.dev>`,
          reply_to: SENDER_EMAIL,
          to:       Array.isArray(opts.to) ? opts.to : [opts.to],
          subject:  opts.subject,
          html:     opts.html,
          text:     opts.text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[Email via Resend] Delivered to ${opts.to} (ID: ${data.id})`);
        return true;
      }
      console.warn(`[Email via Resend] Error (${res.status}):`, JSON.stringify(data));
    } catch (err) {
      console.error(`[Email via Resend] Request failed:`, err.message);
    }
  }

  // 2. Brevo HTTP API — from campustocareer25@gmail.com (sender must be verified in Brevo)
  if (env.BREVO_API_KEY) {
    try {
      const toList = Array.isArray(opts.to)
        ? opts.to.map((e) => ({ email: e }))
        : [{ email: opts.to }];
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender:      { name: SENDER_NAME, email: SENDER_EMAIL },
          to:          toList,
          replyTo:     { email: SENDER_EMAIL },
          subject:     opts.subject,
          htmlContent: opts.html,
          textContent: opts.text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[Email via Brevo] Delivered to ${opts.to} (MessageId: ${data.messageId})`);
        return true;
      }
      console.warn(`[Email via Brevo] Error (${res.status}):`, JSON.stringify(data));
    } catch (err) {
      console.error(`[Email via Brevo] Request failed:`, err.message);
    }
  }

  // 3. Nodemailer SMTP Fallback (Localhost & unblocked hosting)
  if (!transporter) {
    initEmailService();
  }
  if (devMode || !transporter) {
    console.log(`[DEV MODE] Email to ${opts.to}: ${opts.subject}`);
    return false;
  }

  try {
    const result = await transporter.sendMail(opts);
    console.log(`[Email via SMTP] Delivered to ${opts.to} (MessageId: ${result.messageId})`);
    return true;
  } catch (err) {
    if (err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED" || err.message?.includes("timeout")) {
      console.error(`🚨 [Email] SMTP blocked on Render. Add RESEND_API_KEY or BREVO_API_KEY to env vars.`);
    } else {
      console.error(`[Email via SMTP] Delivery failed to ${opts.to}:`, err.message);
    }
    throw err;
  }
};

/**
 * Universal high-reputation HTML layout wrapper
 */
function renderBaseTemplate({
  badgeText = "NOTIFICATION",
  badgeColor = "#4f46e5",
  badgeBg = "#eef2ff",
  heading,
  subheading,
  contentHtml,
  alertHtml = "",
  ctaUrl,
  ctaText,
  secondaryLinkHtml = "",
}) {
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${heading}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f1f5f9; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%); padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">Campus to Career</h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <!-- Tag / Badge -->
              ${
                badgeText
                  ? `<div style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 10px; border-radius: 20px; margin-bottom: 16px;">${badgeText}</div>`
                  : ""
              }

              <!-- Heading -->
              <h2 style="margin: 0 0 8px 0; color: #0f172a; font-size: 20px; font-weight: 700; line-height: 1.3;">
                ${heading}
              </h2>

              <!-- Subheading -->
              ${
                subheading
                  ? `<p style="margin: 0 0 20px 0; color: #64748b; font-size: 14px; line-height: 1.5;">${subheading}</p>`
                  : `<div style="height: 12px;"></div>`
              }

              <!-- Dynamic Content -->
              <div style="color: #334155; font-size: 14px; line-height: 1.6;">
                ${contentHtml}
              </div>

              <!-- Alert Callout if provided -->
              ${
                alertHtml
                  ? `<div style="margin-top: 20px;">${alertHtml}</div>`
                  : ""
              }

              <!-- Action Button CTA -->
              ${
                ctaUrl && ctaText
                  ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.25);">
                      ${ctaText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>`
                  : ""
              }

              <!-- Secondary Link Fallback -->
              ${
                secondaryLinkHtml
                  ? `<div style="margin-top: 16px; font-size: 12px; color: #94a3b8; word-break: break-all;">${secondaryLinkHtml}</div>`
                  : ""
              }
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                &copy; ${year} Campus to Career. <a href="${env.CLIENT_URL || "http://localhost:8080"}" style="color: #6366f1; text-decoration: none;">Visit Portal</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── 1. SEND PASSWORD RESET EMAIL ──────────────────────────────────────────────
async function sendPasswordResetEmail(email, resetLink) {
  const clientUrl = env.CLIENT_URL || "http://localhost:8080";
  const html = renderBaseTemplate({
    badgeText: "PASSWORD RESET",
    badgeColor: "#4f46e5",
    badgeBg: "#eef2ff",
    heading: "Reset Your Password",
    subheading: "You requested to reset your password.",
    contentHtml: `
      <p style="margin: 0 0 16px 0;">
        Click the button below to set a new password for your account.
      </p>
    `,
    alertHtml: `
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px;">
        <p style="margin: 0; color: #991b1b; font-size: 13px; line-height: 1.5;">
          <strong>Important:</strong> This link expires in 15 minutes. If you didn't request this, ignore this email.
        </p>
      </div>
    `,
    ctaUrl: resetLink,
    ctaText: "Reset Password",
    secondaryLinkHtml: `
      Or copy this link: <a href="${resetLink}" style="color: #4f46e5;">${resetLink}</a>
    `,
  });

  const text = `Password Reset - Campus to Career\n\nClick this link to reset your password:\n${resetLink}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, you can ignore this email.`;

  try {
    const opts = getMailOptions({
      to: email,
      subject: "Reset Your Password",
      html,
      text,
    });
    await sendMailPayload(opts);
    console.log(`[Email Service] Password reset email sent to ${email}`);
  } catch (err) {
    console.error("[Email Service] Failed to send password reset email:", err.message);
  }
}

// ── 2. SEND EXAM / TEST ASSIGNED EMAIL ────────────────────────────────────────
async function sendExamAssignedEmail(user, exam, mentorName = "Your Mentor") {
  if (!user?.email) return;

  const clientUrl = env.CLIENT_URL || "http://localhost:8080";
  const examUrl = `${clientUrl}/tests`;
  const studentName = user.name || "Student";
  const examTitle = exam.title || "Assessment";
  const duration = exam.durationMinutes ? `${exam.durationMinutes} min` : "60 min";
  const totalMarks = exam.totalMarks || 100;
  const examType = String(exam.examType || "Assessment");
  const passingScore = exam.passingScorePercentage ? `${exam.passingScorePercentage}%` : "60%";

  let scheduleInfo = "Available now";
  if (exam.isScheduled && exam.scheduledStartTime) {
    scheduleInfo = new Date(exam.scheduledStartTime).toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  }

  const html = renderBaseTemplate({
    badgeText: "NEW ASSESSMENT",
    badgeColor: "#2563eb",
    badgeBg: "#eff6ff",
    heading: examTitle,
    subheading: `${mentorName} has assigned you a new assessment.`,
    contentHtml: `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Type:</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: 500;">${examType}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Duration:</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: 500;">${duration}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Marks:</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: 500;">${totalMarks} (Pass: ${passingScore})</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Schedule:</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: 500;">${scheduleInfo}</td>
        </tr>
      </table>
      <p style="margin: 16px 0 0 0; color: #64748b; font-size: 13px;">
        Ensure stable internet and webcam before starting.
      </p>
    `,
    ctaUrl: examUrl,
    ctaText: "Start Assessment",
    secondaryLinkHtml: `
      Link: <a href="${examUrl}" style="color: #2563eb;">${examUrl}</a>
    `,
  });

  const text = `New Assessment: ${examTitle}\n\nType: ${examType}\nDuration: ${duration}\nMarks: ${totalMarks} (Pass: ${passingScore})\nSchedule: ${scheduleInfo}\n\nStart at: ${examUrl}\n\n- Campus to Career`;

  try {
    const opts = getMailOptions({
      to: user.email,
      subject: `New Assessment: ${examTitle}`,
      html,
      text,
    });
    await sendMailPayload(opts);
    console.log(`[Email Service] Exam assigned notification email sent to ${user.email}`);
  } catch (err) {
    console.error(`[Email Service] Failed to send exam assignment email to ${user.email}:`, err.message);
  }
}

// ── 3. SEND PROCTORING BLOCKED EMAIL ──────────────────────────────────────────
async function sendProctoringBlockedEmail(user, { examTitle = "Assessment", reason = "Multiple violations", violationCount = 3, mentorName = "Your Mentor" }) {
  if (!user?.email) return;

  const studentName = user.name || "Student";
  const clientUrl = env.CLIENT_URL || "http://localhost:8080";

  const html = renderBaseTemplate({
    badgeText: "EXAM LOCKED",
    badgeColor: "#dc2626",
    badgeBg: "#fef2f2",
    heading: "Exam Access Locked",
    subheading: `Your exam session for "${examTitle}" has been locked.`,
    contentHtml: `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0; color: #991b1b; font-size: 14px;">Assessment:</td>
          <td style="padding: 8px 0; color: #7f1d1d; font-size: 14px; font-weight: 500;">${examTitle}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #991b1b; font-size: 14px;">Violations:</td>
          <td style="padding: 8px 0; color: #7f1d1d; font-size: 14px; font-weight: 500;">${violationCount} strikes</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #991b1b; font-size: 14px;">Reason:</td>
          <td style="padding: 8px 0; color: #7f1d1d; font-size: 14px; font-weight: 500;">${reason}</td>
        </tr>
      </table>
      <p style="margin: 16px 0 0 0; color: #64748b; font-size: 14px;">
        Contact ${mentorName} to review and unlock your access.
      </p>
    `,
    alertHtml: `
      <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 4px;">
        <p style="margin: 0; color: #991b1b; font-size: 13px;">
          <strong>Action Required:</strong> Your mentor must review and unlock your exam before you can continue.
        </p>
      </div>
    `,
    ctaUrl: `${clientUrl}/dashboard`,
    ctaText: "Go to Dashboard",
  });

  const text = `Exam Access Locked\n\nYour exam "${examTitle}" has been locked.\n\nViolations: ${violationCount}\nReason: ${reason}\n\nContact ${mentorName} to unlock.\n\n- Campus to Career`;

  try {
    const opts = getMailOptions({
      to: user.email,
      subject: `Exam Access Locked: ${examTitle}`,
      html,
      text,
    });
    await sendMailPayload(opts);
    console.log(`[Email Service] Proctoring blocked alert sent to ${user.email}`);
  } catch (err) {
    console.error(`[Email Service] Failed to send proctoring blocked email to ${user.email}:`, err.message);
  }
}

// ── 4. SEND PROCTORING UNBLOCKED EMAIL ────────────────────────────────────────
async function sendProctoringUnblockedEmail(user, { examTitle = "Assessment", mentorName = "Your Mentor", examUrl = "" }) {
  if (!user?.email) return;

  const studentName = user.name || "Student";
  const clientUrl = env.CLIENT_URL || "http://localhost:8080";
  const targetUrl = examUrl || `${clientUrl}/tests`;

  const html = renderBaseTemplate({
    badgeText: "ACCESS RESTORED",
    badgeColor: "#16a34a",
    badgeBg: "#f0fdf4",
    heading: "Exam Access Restored",
    subheading: `${mentorName} has unlocked your access to "${examTitle}".`,
    contentHtml: `
      <p style="margin: 0 0 16px 0; color: #334155; font-size: 14px;">
        Your exam has been reviewed and you can now resume.
      </p>
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        Stay in fullscreen mode and avoid switching tabs.
      </p>
    `,
    ctaUrl: targetUrl,
    ctaText: "Resume Exam",
    secondaryLinkHtml: `
      Link: <a href="${targetUrl}" style="color: #16a34a;">${targetUrl}</a>
    `,
  });

  const text = `Exam Access Restored\n\nYour access to "${examTitle}" has been restored.\n\nResume at: ${targetUrl}\n\n- Campus to Career`;

  try {
    const opts = getMailOptions({
      to: user.email,
      subject: `Exam Access Restored: ${examTitle}`,
      html,
      text,
    });
    await sendMailPayload(opts);
    console.log(`[Email Service] Proctoring unblocked email sent to ${user.email}`);
  } catch (err) {
    console.error(`[Email Service] Failed to send unblock email to ${user.email}:`, err.message);
  }
}

// ── 5. SEND SECURITY NEW LOGIN ALERT EMAIL ───────────────────────────────────
async function sendNewLoginAlertEmail(user, { ip = "Unknown", userAgent = "", loginTime = new Date() } = {}) {
  if (!user?.email) return;

  const studentName = user.name || "User";
  const clientUrl = env.CLIENT_URL || "http://localhost:8080";
  const device = parseUserAgent(userAgent);
  const timeFormatted = new Date(loginTime).toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: 'numeric', 
    minute: '2-digit' 
  });

  const html = renderBaseTemplate({
    badgeText: "NEW LOGIN",
    badgeColor: "#0284c7",
    badgeBg: "#e0f2fe",
    heading: "New Sign-In",
    subheading: "A new sign-in to your account was detected.",
    contentHtml: `
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Time:</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: 500;">${timeFormatted}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Device:</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: 500;">${device}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">IP:</td>
          <td style="padding: 8px 0; color: #0f172a; font-size: 14px; font-weight: 500; font-family: monospace;">${ip}</td>
        </tr>
      </table>
      <p style="margin: 16px 0 0 0; color: #64748b; font-size: 13px;">
        If this wasn't you, change your password immediately.
      </p>
    `,
    alertHtml: `
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 4px;">
        <p style="margin: 0; color: #991b1b; font-size: 12px; line-height: 1.5;">
          ⚠️ <strong>Don't recognize this activity?</strong> Change your password and terminate any open sessions immediately.
        </p>
      </div>
    `,
    ctaUrl: `${clientUrl}/forgot-password`,
    ctaText: "Secure My Account",
  });

  const text = `Hello ${studentName},\n\nA new sign-in was detected on your Campus to Career account.\n- Time: ${timeFormatted}\n- Device: ${device}\n- IP: ${ip}\n\nIf this was not you, reset your password immediately at:\n${clientUrl}/forgot-password\n\nCampus to Career AI Security`;

  try {
    const opts = getMailOptions({
      to: user.email,
      subject: `Security Alert: New Sign-In to Your Account — Campus to Career AI`,
      html,
      text,
    });
    await sendMailPayload(opts);
    console.log(`[Email Service] Login alert sent to ${user.email}`);
  } catch (err) {
    console.error(`[Email Service] Failed to send login alert email to ${user.email}:`, err.message);
  }
}

// ── 6. SEND WELCOME EMAIL ─────────────────────────────────────────────────────
async function sendWelcomeEmail(user) {
  if (!user?.email) return;

  const studentName = user.name || "Student";
  const clientUrl = env.CLIENT_URL || "http://localhost:8080";

  const html = renderBaseTemplate({
    badgeText: "WELCOME",
    badgeColor: "#4f46e5",
    badgeBg: "#eef2ff",
    heading: `Welcome, ${studentName}!`,
    subheading: "Your Campus to Career account is ready.",
    contentHtml: `
      <p style="margin: 0 0 20px 0; color: #334155; font-size: 14px; line-height: 1.6;">
        Get started with AI-powered career readiness tools:
      </p>
      <ul style="margin: 0; padding: 0 0 0 20px; color: #475569; font-size: 14px; line-height: 1.8;">
        <li><strong>Resume Analysis:</strong> Get ATS scores and improvement suggestions</li>
        <li><strong>Mock Interviews:</strong> Practice with AI-powered interview coach</li>
        <li><strong>Coding Practice:</strong> Solve DSA problems with instant feedback</li>
        <li><strong>Skill Assessments:</strong> Take tests and track your progress</li>
        <li><strong>GitHub Integration:</strong> Showcase your projects</li>
      </ul>
      <p style="margin: 20px 0 0 0; color: #64748b; font-size: 13px;">
        Start by completing your profile and uploading your resume.
      </p>
    `,
    ctaUrl: `${clientUrl}/dashboard`,
    ctaText: "Go to Dashboard",
  });

  const text = `Welcome to Campus to Career, ${studentName}!\n\nYour account is ready. Here's what you can do:\n\n- Analyze your resume for ATS compatibility\n- Practice interviews with AI coach\n- Solve coding problems\n- Take skill assessments\n- Connect GitHub\n\nGet started: ${clientUrl}/dashboard\n\n- Campus to Career Team`;

  try {
    const opts = getMailOptions({
      to: user.email,
      subject: `Welcome to Campus to Career!`,
      html,
      text,
    });
    await sendMailPayload(opts);
    console.log(`[Email Service] Welcome email sent to ${user.email}`);
  } catch (err) {
    console.error(`[Email Service] Failed to send welcome email to ${user.email}:`, err.message);
  }
}

initEmailService();

/**
 * Send email verification link
 * @param {Object} user - User object with email and name
 * @param {string} verificationToken - Verification token
 */
async function sendVerificationEmail(user, verificationToken) {
  const verificationLink = `${env.FRONTEND_URL || "http://localhost:5173"}/verify-email?token=${verificationToken}`;

  const html = renderBaseTemplate({
    title: "Verify Your Email",
    preheader: "Complete your Campus to Career registration",
    heroTitle: "Verify Your Email Address",
    heroSubtitle: `Welcome ${user.name}! Please verify your email to access all features.`,
    bodyContent: `
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: #374151;">
        Hi <strong>${user.name}</strong>,
      </p>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: #374151;">
        Thank you for registering with Campus to Career! To complete your registration and access all features, 
        please verify your email address by clicking the button below.
      </p>
      <p style="margin: 0 0 24px; font-size: 15px; line-height: 24px; color: #374151;">
        This verification link will expire in <strong>24 hours</strong> for security reasons.
      </p>
    `,
    ctaText: "Verify Email Address",
    ctaLink: verificationLink,
    footerText: `
      <p style="margin: 0 0 8px; font-size: 13px; line-height: 20px; color: #6b7280;">
        If you didn't create an account with Campus to Career, you can safely ignore this email.
      </p>
      <p style="margin: 0; font-size: 13px; line-height: 20px; color: #6b7280;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${verificationLink}" style="color: #6366f1; text-decoration: none; word-break: break-all;">${verificationLink}</a>
      </p>
    `,
  });

  const mailOptions = getMailOptions({
    to: user.email,
    subject: "Verify Your Email - Campus to Career",
    html,
    text: `Hi ${user.name},\n\nPlease verify your email by clicking this link: ${verificationLink}\n\nThis link expires in 24 hours.\n\nIf you didn't create this account, ignore this email.`,
  });

  return sendMailPayload(mailOptions);
}


module.exports = {
  sendPasswordResetEmail,
  sendExamAssignedEmail,
  sendProctoringBlockedEmail,
  sendProctoringUnblockedEmail,
  sendNewLoginAlertEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
};
