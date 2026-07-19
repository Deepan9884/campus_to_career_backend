/**
 * Seed script for the RoleSkill bank.
 *
 * Usage:
 *   node backend/scripts/seedRoleSkills.js             # insert only missing entries
 *   node backend/scripts/seedRoleSkills.js --force     # clear all then reseed
 *
 * Idempotent: skips entries where targetRole + skillName already exists.
 */

const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const RoleSkill = require("../src/models/RoleSkill.model");

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in environment / .env");
  process.exit(1);
}

const roleSkills = [
  // ── Software Engineer ──
  { targetRole: "Software Engineer", skillName: "JavaScript", category: "Languages", importance: "core" },
  { targetRole: "Software Engineer", skillName: "Python", category: "Languages", importance: "core" },
  { targetRole: "Software Engineer", skillName: "TypeScript", category: "Languages", importance: "nice-to-have" },
  { targetRole: "Software Engineer", skillName: "Java", category: "Languages", importance: "nice-to-have" },
  { targetRole: "Software Engineer", skillName: "Git", category: "Tools", importance: "core" },
  { targetRole: "Software Engineer", skillName: "REST APIs", category: "Architecture", importance: "core" },
  { targetRole: "Software Engineer", skillName: "SQL", category: "Databases", importance: "core" },
  { targetRole: "Software Engineer", skillName: "Unit Testing", category: "Practices", importance: "core" },
  { targetRole: "Software Engineer", skillName: "CI/CD", category: "DevOps", importance: "nice-to-have" },
  { targetRole: "Software Engineer", skillName: "Docker", category: "DevOps", importance: "nice-to-have" },
  { targetRole: "Software Engineer", skillName: "Data Structures & Algorithms", category: "Fundamentals", importance: "core" },
  { targetRole: "Software Engineer", skillName: "System Design", category: "Fundamentals", importance: "nice-to-have" },

  // ── Frontend Developer ──
  { targetRole: "Frontend Developer", skillName: "JavaScript", category: "Languages", importance: "core" },
  { targetRole: "Frontend Developer", skillName: "TypeScript", category: "Languages", importance: "core" },
  { targetRole: "Frontend Developer", skillName: "HTML", category: "Markup", importance: "core" },
  { targetRole: "Frontend Developer", skillName: "CSS", category: "Styling", importance: "core" },
  { targetRole: "Frontend Developer", skillName: "React", category: "Frameworks", importance: "core" },
  { targetRole: "Frontend Developer", skillName: "Vue", category: "Frameworks", importance: "nice-to-have" },
  { targetRole: "Frontend Developer", skillName: "Tailwind CSS", category: "Styling", importance: "nice-to-have" },
  { targetRole: "Frontend Developer", skillName: "Responsive Design", category: "Practices", importance: "core" },
  { targetRole: "Frontend Developer", skillName: "Git", category: "Tools", importance: "core" },
  { targetRole: "Frontend Developer", skillName: "REST APIs", category: "Architecture", importance: "core" },
  { targetRole: "Frontend Developer", skillName: "Testing (Jest/Cypress)", category: "Practices", importance: "nice-to-have" },
  { targetRole: "Frontend Developer", skillName: "Performance Optimization", category: "Practices", importance: "nice-to-have" },

  // ── Backend Developer ──
  { targetRole: "Backend Developer", skillName: "Python", category: "Languages", importance: "core" },
  { targetRole: "Backend Developer", skillName: "JavaScript", category: "Languages", importance: "core" },
  { targetRole: "Backend Developer", skillName: "Node.js", category: "Runtime", importance: "core" },
  { targetRole: "Backend Developer", skillName: "SQL", category: "Databases", importance: "core" },
  { targetRole: "Backend Developer", skillName: "PostgreSQL", category: "Databases", importance: "core" },
  { targetRole: "Backend Developer", skillName: "REST APIs", category: "Architecture", importance: "core" },
  { targetRole: "Backend Developer", skillName: "Authentication & Authorization", category: "Security", importance: "core" },
  { targetRole: "Backend Developer", skillName: "Git", category: "Tools", importance: "core" },
  { targetRole: "Backend Developer", skillName: "Docker", category: "DevOps", importance: "nice-to-have" },
  { targetRole: "Backend Developer", skillName: "CI/CD", category: "DevOps", importance: "nice-to-have" },
  { targetRole: "Backend Developer", skillName: "Caching (Redis)", category: "Performance", importance: "nice-to-have" },
  { targetRole: "Backend Developer", skillName: "Message Queues", category: "Architecture", importance: "nice-to-have" },

  // ── Full Stack Developer ──
  { targetRole: "Full Stack Developer", skillName: "JavaScript", category: "Languages", importance: "core" },
  { targetRole: "Full Stack Developer", skillName: "TypeScript", category: "Languages", importance: "core" },
  { targetRole: "Full Stack Developer", skillName: "React", category: "Frameworks", importance: "core" },
  { targetRole: "Full Stack Developer", skillName: "Node.js", category: "Runtime", importance: "core" },
  { targetRole: "Full Stack Developer", skillName: "SQL", category: "Databases", importance: "core" },
  { targetRole: "Full Stack Developer", skillName: "REST APIs", category: "Architecture", importance: "core" },
  { targetRole: "Full Stack Developer", skillName: "Git", category: "Tools", importance: "core" },
  { targetRole: "Full Stack Developer", skillName: "HTML/CSS", category: "Markup", importance: "core" },
  { targetRole: "Full Stack Developer", skillName: "Docker", category: "DevOps", importance: "nice-to-have" },
  { targetRole: "Full Stack Developer", skillName: "Testing (Jest)", category: "Practices", importance: "nice-to-have" },
  { targetRole: "Full Stack Developer", skillName: "CI/CD", category: "DevOps", importance: "nice-to-have" },
  { targetRole: "Full Stack Developer", skillName: "Cloud (AWS/GCP)", category: "DevOps", importance: "nice-to-have" },

  // ── Data Scientist ──
  { targetRole: "Data Scientist", skillName: "Python", category: "Languages", importance: "core" },
  { targetRole: "Data Scientist", skillName: "SQL", category: "Databases", importance: "core" },
  { targetRole: "Data Scientist", skillName: "Pandas", category: "Libraries", importance: "core" },
  { targetRole: "Data Scientist", skillName: "NumPy", category: "Libraries", importance: "core" },
  { targetRole: "Data Scientist", skillName: "Scikit-learn", category: "Libraries", importance: "core" },
  { targetRole: "Data Scientist", skillName: "Statistics", category: "Fundamentals", importance: "core" },
  { targetRole: "Data Scientist", skillName: "Data Visualization (Matplotlib/Seaborn)", category: "Libraries", importance: "core" },
  { targetRole: "Data Scientist", skillName: "Jupyter Notebooks", category: "Tools", importance: "core" },
  { targetRole: "Data Scientist", skillName: "Machine Learning", category: "Fundamentals", importance: "nice-to-have" },
  { targetRole: "Data Scientist", skillName: "Deep Learning (TensorFlow/PyTorch)", category: "Libraries", importance: "nice-to-have" },
  { targetRole: "Data Scientist", skillName: "Git", category: "Tools", importance: "nice-to-have" },
  { targetRole: "Data Scientist", skillName: "Cloud (AWS/GCP)", category: "DevOps", importance: "nice-to-have" },

  // ── DevOps Engineer ──
  { targetRole: "DevOps Engineer", skillName: "Linux", category: "OS", importance: "core" },
  { targetRole: "DevOps Engineer", skillName: "Docker", category: "Containers", importance: "core" },
  { targetRole: "DevOps Engineer", skillName: "Kubernetes", category: "Orchestration", importance: "core" },
  { targetRole: "DevOps Engineer", skillName: "CI/CD (GitHub Actions/Jenkins)", category: "Automation", importance: "core" },
  { targetRole: "DevOps Engineer", skillName: "Terraform", category: "IaC", importance: "core" },
  { targetRole: "DevOps Engineer", skillName: "AWS", category: "Cloud", importance: "core" },
  { targetRole: "DevOps Engineer", skillName: "Azure", category: "Cloud", importance: "nice-to-have" },
  { targetRole: "DevOps Engineer", skillName: "GCP", category: "Cloud", importance: "nice-to-have" },
  { targetRole: "DevOps Engineer", skillName: "Bash/Shell Scripting", category: "Languages", importance: "core" },
  { targetRole: "DevOps Engineer", skillName: "Python", category: "Languages", importance: "nice-to-have" },
  { targetRole: "DevOps Engineer", skillName: "Monitoring (Prometheus/Grafana)", category: "Observability", importance: "core" },
  { targetRole: "DevOps Engineer", skillName: "Git", category: "Tools", importance: "core" },
];

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("[seed] Connected to MongoDB");

  const force = process.argv.includes("--force");
  if (force) {
    await RoleSkill.deleteMany({});
    console.log("[seed] Cleared all existing role skills (--force)");
  }

  let inserted = 0;
  for (const rs of roleSkills) {
    const exists = await RoleSkill.findOne({
      targetRole: rs.targetRole,
      skillName: rs.skillName,
    });
    if (!exists) {
      await RoleSkill.create(rs);
      inserted++;
    }
  }

  const total = await RoleSkill.countDocuments();
  const roles = await RoleSkill.distinct("targetRole");

  console.log(`[seed] Done. Inserted ${inserted} new entries. Total in DB: ${total}`);
  console.log(`[seed] Roles: ${roles.length} — ${roles.join(", ")}`);

  await mongoose.disconnect();
  console.log("[seed] Disconnected.");
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
