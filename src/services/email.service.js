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
 * 1. Uses Resend HTTP API (Port 443) if RESEND_API_KEY is present (100% immune to Render port blocking)
 * 2. Uses Brevo HTTP API (Port 443) if BREVO_API_KEY is present (100% immune to Render port blocking)
 * 3. Falls back to Nodemailer SMTP (Localhost & environments with unblocked SMTP ports)
 */
async function sendMailPayload(opts) {
  // 1. Resend HTTP API (Bypasses all outbound port blocks on Render/Vercel)
  if (env.RESEND_API_KEY) {
    try {
      const payload = {
        from: opts.from || "Campus to Career AI <onboarding@resend.dev>",
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      };
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[Email Service via Resend HTTP] Email delivered to ${opts.to} (ID: ${data.id})`);
        return true;
      }
      console.warn(`[Email Service] Resend API error (${res.status}):`, data);
    } catch (err) {
      console.error(`[Email Service] Resend HTTP request failed:`, err.message);
    }
  }

  // 2. Brevo HTTP API (Bypasses all outbound port blocks on Render/Vercel)
  if (env.BREVO_API_KEY) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Campus to Career AI", email: env.SMTP_USER || "campustocareer25@gmail.com" },
          to: [{ email: opts.to }],
          subject: opts.subject,
          htmlContent: opts.html,
          textContent: opts.text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[Email Service via Brevo HTTP] Email delivered to ${opts.to} (MessageId: ${data.messageId})`);
        return true;
      }
      console.warn(`[Email Service] Brevo API error (${res.status}):`, data);
    } catch (err) {
      console.error(`[Email Service] Brevo HTTP request failed:`, err.message);
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
    console.log(`[Email Service via SMTP] Email delivered to ${opts.to} (MessageId: ${result.messageId})`);
    return true;
  } catch (err) {
    if (err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED" || err.message?.includes("timeout")) {
      console.error(
        `🚨 [Email Service] Outbound SMTP connection blocked! Render free tier blocks outbound TCP ports 25, 465, and 587. ` +
        `To enable instant email delivery on Render, add a free RESEND_API_KEY or BREVO_API_KEY to your Render Environment Variables.`
      );
    } else {
      console.error(`[Email Service] SMTP delivery failed to ${opts.to}:`, err.message);
    }
    throw err;
  }
}

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
          
          <!-- Gradient Top Brand Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #4f46e5 50%, #7c3aed 100%); padding: 28px 24px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Campus to Career AI</h1>
                    <p style="margin: 4px 0 0 0; color: #e0e7ff; font-size: 13px; font-weight: 500;">Next-Gen Placement & Skill Intelligence Platform</p>
                  </td>
                </tr>
              </table>
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

          <!-- Security & Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: center;">
              <p style="margin: 0 0 6px 0; color: #64748b; font-size: 12px;">
                This is an automated transactional security message from Campus to Career AI.
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                &copy; ${year} Campus to Career AI Inc. All rights reserved. &bull; <a href="${env.CLIENT_URL || "http://localhost:8080"}" style="color: #6366f1; text-decoration: none;">Student Portal</a>
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
  if (devMode || !transporter) {
    console.log(`[DEV MODE] Password reset link for ${email}: ${resetLink}`);
    return;
  }

  const clientUrl = env.CLIENT_URL || "http://localhost:8080";
  const html = renderBaseTemplate({
    badgeText: "SECURITY ALERT",
    badgeColor: "#4f46e5",
    badgeBg: "#eef2ff",
    heading: "Reset Your Password",
    subheading: "We received a request to reset the password for your Campus to Career account.",
    contentHtml: `
      <p style="margin: 0 0 12px 0;">
        Click the button below to securely set a new password. If you initiated this request, you can proceed immediately.
      </p>
    `,
    alertHtml: `
      <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 12px 16px; border-radius: 4px;">
        <p style="margin: 0; color: #475569; font-size: 12px; line-height: 1.5;">
          ⏱️ <strong>Security Notice:</strong> This reset link will strictly expire in <strong>15 minutes</strong>. If you did not request this, please disregard this email.
        </p>
      </div>
    `,
    ctaUrl: resetLink,
    ctaText: "Reset Password",
    secondaryLinkHtml: `
      If the button above does not work, copy and paste this link into your browser:<br />
      <a href="${resetLink}" style="color: #4f46e5; text-decoration: underline;">${resetLink}</a>
    `,
  });

  const text = `Campus to Career AI - Password Reset\n\nYou requested a password reset for your account.\nPlease click the link below or copy it into your browser to reset your password:\n${resetLink}\n\nThis link will expire in 15 minutes.\nIf you did not request this, you can safely ignore this email.`;

  try {
    const opts = getMailOptions({
      to: email,
      subject: "Password Reset Request — Campus to Career AI",
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
  if (devMode || !transporter) {
    console.log(`[DEV MODE] Exam Assigned Email to ${user.email} for "${exam?.title}"`);
    return;
  }

  const clientUrl = env.CLIENT_URL || "http://localhost:8080";
  const examUrl = `${clientUrl}/tests`;
  const studentName = user.name || "Student";
  const examTitle = exam.title || "Assessment";
  const duration = exam.durationMinutes ? `${exam.durationMinutes} Minutes` : "60 Minutes";
  const totalMarks = exam.totalMarks || 100;
  const examType = String(exam.examType || "Assessment").toUpperCase();
  const passingScore = exam.passingScorePercentage ? `${exam.passingScorePercentage}%` : "60%";

  let scheduleInfo = "Available Now";
  if (exam.isScheduled && exam.scheduledStartTime) {
    scheduleInfo = `${new Date(exam.scheduledStartTime).toLocaleString()}`;
    if (exam.scheduledEndTime) {
      scheduleInfo += ` to ${new Date(exam.scheduledEndTime).toLocaleTimeString()}`;
    }
  }

  const html = renderBaseTemplate({
    badgeText: "NEW TEST ASSIGNED",
    badgeColor: "#2563eb",
    badgeBg: "#eff6ff",
    heading: `New Assessment: ${examTitle}`,
    subheading: `Hello ${studentName}, ${mentorName} has assigned a new assessment for your cohort.`,
    contentHtml: `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 40%;"><strong>Assessment Title:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${examTitle}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Exam Format:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${examType}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Duration:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${duration}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Total Marks:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${totalMarks} Marks (Passing: ${passingScore})</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Schedule Window:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${scheduleInfo}</td>
          </tr>
        </table>
      </div>
      <p style="margin: 12px 0 0 0; color: #475569; font-size: 13px;">
        Please ensure you have a stable internet connection and webcam enabled (if required) before launching the exam.
      </p>
    `,
    alertHtml: `
      <div style="background-color: #fefce8; border-left: 4px solid #eab308; padding: 12px 16px; border-radius: 4px;">
        <p style="margin: 0; color: #854d0e; font-size: 12px; line-height: 1.5;">
          🛡️ <strong>Anti-Cheat Active:</strong> Fullscreen enforcement and tab-switch monitoring are enabled. Please do not switch tabs or exit fullscreen mode during the exam.
        </p>
      </div>
    `,
    ctaUrl: examUrl,
    ctaText: "Launch Assessment Console",
    secondaryLinkHtml: `
      Direct Portal Link: <a href="${examUrl}" style="color: #4f46e5;">${examUrl}</a>
    `,
  });

  const text = `Hello ${studentName},\n\n${mentorName} has assigned you a new assessment: "${examTitle}".\n\nExam Details:\n- Format: ${examType}\n- Duration: ${duration}\n- Total Marks: ${totalMarks} (Passing: ${passingScore})\n- Schedule: ${scheduleInfo}\n\nAccess the exam console at:\n${examUrl}\n\nBest of luck,\nCampus to Career AI Team`;

  try {
    const opts = getMailOptions({
      to: user.email,
      subject: `New Assessment Assigned: ${examTitle} — Campus to Career AI`,
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
async function sendProctoringBlockedEmail(user, { examTitle = "Assessment", reason = "Anti-cheat violations limit exceeded", violationCount = 3, mentorName = "Your Mentor" }) {
  if (!user?.email) return;
  if (devMode || !transporter) {
    console.log(`[DEV MODE] Proctoring Blocked Email to ${user.email} for "${examTitle}"`);
    return;
  }

  const studentName = user.name || "Student";
  const clientUrl = env.CLIENT_URL || "http://localhost:8080";

  const html = renderBaseTemplate({
    badgeText: "EXAM ACCESS LOCKED",
    badgeColor: "#dc2626",
    badgeBg: "#fef2f2",
    heading: "Exam Access Temporarily Locked",
    subheading: `Hello ${studentName}, your examination session for "${examTitle}" has been locked due to proctoring policy violations.`,
    contentHtml: `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #991b1b; width: 40%;"><strong>Assessment:</strong></td>
            <td style="padding: 6px 0; color: #7f1d1d; font-weight: 600;">${examTitle}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #991b1b;"><strong>Violation Strikes:</strong></td>
            <td style="padding: 6px 0; color: #7f1d1d;">${violationCount} Strikes Recorded</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #991b1b;"><strong>Trigger Reason:</strong></td>
            <td style="padding: 6px 0; color: #7f1d1d;">${reason}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #991b1b;"><strong>Status:</strong></td>
            <td style="padding: 6px 0; color: #dc2626; font-weight: 700;">Locked / Requires Mentor Unblock</td>
          </tr>
        </table>
      </div>
      <p style="margin: 12px 0 0 0; color: #475569; font-size: 13px; line-height: 1.5;">
        To maintain strict institutional academic integrity, candidate sessions that exceed proctoring thresholds require faculty authorization to unlock.
      </p>
    `,
    alertHtml: `
      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 4px;">
        <p style="margin: 0; color: #1e293b; font-size: 13px; font-weight: 600;">Next Steps to Restore Access:</p>
        <p style="margin: 4px 0 0 0; color: #475569; font-size: 12px; line-height: 1.5;">
          1. Contact your assigned mentor / instructor (${mentorName}).<br />
          2. Your faculty can review your proctoring violation logs in the Mentor Portal and restore your exam access.
        </p>
      </div>
    `,
    ctaUrl: `${clientUrl}/dashboard`,
    ctaText: "Go to Student Dashboard",
  });

  const text = `Hello ${studentName},\n\nYour examination session for "${examTitle}" has been locked due to proctoring violations.\n\nDetails:\n- Reason: ${reason}\n- Strikes: ${violationCount}\n- Status: Locked\n\nPlease contact your mentor (${mentorName}) to review your session and restore your exam access.\n\nCampus to Career AI Security`;

  try {
    const opts = getMailOptions({
      to: user.email,
      subject: `Urgent: Exam Access Temporarily Locked — Campus to Career AI`,
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
  if (devMode || !transporter) {
    console.log(`[DEV MODE] Proctoring Unblocked Email to ${user.email} for "${examTitle}"`);
    return;
  }

  const studentName = user.name || "Student";
  const clientUrl = env.CLIENT_URL || "http://localhost:8080";
  const targetUrl = examUrl || `${clientUrl}/tests`;

  const html = renderBaseTemplate({
    badgeText: "ACCESS RESTORED",
    badgeColor: "#16a34a",
    badgeBg: "#f0fdf4",
    heading: "Exam Access Restored ✅",
    subheading: `Hello ${studentName}, your exam access for "${examTitle}" has been restored by ${mentorName}.`,
    contentHtml: `
      <p style="margin: 0 0 12px 0; color: #334155; font-size: 14px; line-height: 1.6;">
        Your faculty mentor has reviewed your case and unlocked your examination access. You may now return to the assessment console and resume your test.
      </p>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin: 16px 0;">
        <p style="margin: 0; color: #166534; font-size: 13px; font-weight: 600;">
          Status: Access Active & Clean Violation Slate
        </p>
        <p style="margin: 4px 0 0 0; color: #15803d; font-size: 12px;">
          Please maintain fullscreen mode and avoid background tab switching to prevent further locks.
        </p>
      </div>
    `,
    ctaUrl: targetUrl,
    ctaText: "Resume Examination Now",
    secondaryLinkHtml: `
      Direct Link: <a href="${targetUrl}" style="color: #16a34a;">${targetUrl}</a>
    `,
  });

  const text = `Hello ${studentName},\n\nGreat news! Your exam access for "${examTitle}" has been unlocked by ${mentorName}.\n\nYou can resume your examination now by visiting:\n${targetUrl}\n\nCampus to Career AI`;

  try {
    const opts = getMailOptions({
      to: user.email,
      subject: `Exam Access Restored: You May Now Resume — Campus to Career AI`,
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
async function sendNewLoginAlertEmail(user, { ip = "Unknown IP", userAgent = "", loginTime = new Date() } = {}) {
  if (!user?.email) return;
  if (!transporter) {
    initEmailService();
  }
  if (devMode || !transporter) {
    console.log(`[DEV MODE] Security Login Alert to ${user.email} (IP: ${ip})`);
    return;
  }

  const studentName = user.name || "User";
  const clientUrl = env.CLIENT_URL || "http://localhost:8080";
  const device = parseUserAgent(userAgent);
  const timeFormatted = loginTime ? new Date(loginTime).toLocaleString() : new Date().toLocaleString();

  const html = renderBaseTemplate({
    badgeText: "SECURITY ALERT",
    badgeColor: "#0284c7",
    badgeBg: "#e0f2fe",
    heading: "New Sign-In Detected",
    subheading: `Hello ${studentName}, we detected a successful sign-in to your Campus to Career account.`,
    contentHtml: `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 40%;"><strong>Sign-In Time:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${timeFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Device / Browser:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${device}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>IP Address:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${ip}</td>
          </tr>
        </table>
      </div>
      <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.5;">
        If this was you, you can safely ignore this email. If you did <strong>not</strong> sign in recently, please secure your account immediately.
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
    badgeText: "WELCOME TO CAMPUS TO CAREER",
    badgeColor: "#4f46e5",
    badgeBg: "#eef2ff",
    heading: `Welcome aboard, ${studentName}! 🚀`,
    subheading: "Your AI-powered career readiness and placement acceleration studio is now ready.",
    contentHtml: `
      <p style="margin: 0 0 16px 0; color: #334155; font-size: 14px; line-height: 1.6;">
        Welcome to <strong>Campus to Career AI</strong> — the next-generation intelligent platform built to turn your academic knowledge into recruiter-ready internship and job offers.
      </p>

      <div style="margin: 20px 0;">
        <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 15px; font-weight: 700;">🌟 What you can do inside your workspace:</h3>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px; line-height: 1.6;">
          <tr>
            <td style="padding: 10px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
              <strong style="color: #4f46e5;">📄 ATS Resume Studio:</strong> Upload your PDF/DOCX resume to receive instant ATS formatting diagnostics, keyword gap analysis, and AI bullet-point rewrites.
            </td>
          </tr>
          <tr><td style="height: 8px;"></td></tr>
          <tr>
            <td style="padding: 10px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
              <strong style="color: #0284c7;">🎙️ AI Voice Mock Coach:</strong> Practice live voice-driven technical, behavioral, and system design interviews tailored to your target company with STAR scorecards.
            </td>
          </tr>
          <tr><td style="height: 8px;"></td></tr>
          <tr>
            <td style="padding: 10px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
              <strong style="color: #7c3aed;">🚀 SuperDream DSA & Coding Arena:</strong> Solve curated coding problems with instant test case execution and compiler feedback across Python, Java, C++, and JS.
            </td>
          </tr>
          <tr><td style="height: 8px;"></td></tr>
          <tr>
            <td style="padding: 10px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
              <strong style="color: #059669;">📊 Skill Gap Matrix & Learning Roadmaps:</strong> Benchmark your skillset against industry standards and unlock step-by-step career roadmaps.
            </td>
          </tr>
          <tr><td style="height: 8px;"></td></tr>
          <tr>
            <td style="padding: 10px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <strong style="color: #d97706;">🛡️ Faculty Assessments & Live Proctoring:</strong> Attempt institute-assigned quizzes and coding rounds with anti-cheat monitoring.
            </td>
          </tr>
        </table>
      </div>

      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin: 20px 0;">
        <h4 style="margin: 0 0 6px 0; color: #166534; font-size: 13px; font-weight: 700;">🎯 3 Quick Steps to Get Started:</h4>
        <ol style="margin: 0; padding-left: 18px; color: #15803d; font-size: 12px; line-height: 1.7;">
          <li>Select your target job role in your profile setup.</li>
          <li>Connect your GitHub & coding handles to track progress.</li>
          <li>Upload your resume for your first instant AI evaluation.</li>
        </ol>
      </div>
    `,
    ctaUrl: `${clientUrl}/dashboard`,
    ctaText: "Launch My Student Dashboard",
  });

  const text = `Welcome to Campus to Career AI, ${studentName}!\n\nYour account has been set up successfully.\n\nKey Platform Features:\n- ATS Resume Studio: Real-time keyword scoring and ATS formatting audits\n- AI Voice Mock Coach: Live simulated voice interviews with STAR scorecards\n- SuperDream DSA Arena: Curated algorithmic prep and multi-language compiler\n- Skill Gap Roadmaps: Tailored milestones for your target role\n- Faculty Exam Console: Proctored coding and MCQ assessments\n\nStart your journey today at:\n${clientUrl}/dashboard\n\nBest regards,\nCampus to Career AI Team`;

  try {
    const opts = getMailOptions({
      to: user.email,
      subject: `Welcome to Campus to Career AI, ${studentName}! 🚀 Your AI Preparation Studio is Ready`,
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

module.exports = {
  sendPasswordResetEmail,
  sendExamAssignedEmail,
  sendProctoringBlockedEmail,
  sendProctoringUnblockedEmail,
  sendNewLoginAlertEmail,
  sendWelcomeEmail,
};
