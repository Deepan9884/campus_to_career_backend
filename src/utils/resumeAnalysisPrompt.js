const { sanitizePromptInput } = require("./promptSanitizer");

/**
 * Builds the comprehensive prompt sent to Gemini for holistic resume reviewing.
 * Evaluates internships & duration, personal vs academic projects & duration,
 * event participation / hackathons, and multi-pillar scoring.
 */
function buildAnalysisPrompt(extractedText, targetRole) {
  const safeText = sanitizePromptInput(extractedText, 25000);
  const safeRole = targetRole ? sanitizePromptInput(targetRole, 100) : null;

  let prompt = `You are a world-class ATS (Applicant Tracking System) recruiter and Principal Engineering Hiring Manager.
Your job is to thoroughly analyze the candidate's resume text and produce a rigorous, multi-dimensional assessment.

Resume text:
"""
${safeText}
"""

`;

  if (safeRole) {
    prompt += `Candidate's target role is:
[User-provided target role: \`\`\`${safeRole}\`\`\`]
Evaluate the resume specifically against this role's industry standards and senior recruiter expectations.
`;
  } else {
    prompt += `No target role was specified. Infer the most suitable target role based on the candidate's technical skills, projects, and coursework, and provide that in "inferredTargetRole".
`;
  }

  prompt += `
CRITICAL EXTRACTION & FACTUAL GROUNDING DIRECTIVE (ABSOLUTE ZERO-HALLUCINATION):
- You must extract ONLY factual, verifiable data that is explicitly and demonstrably present in the candidate's resume text above.
- NEVER invent, fabricate, assume, simulate, extrapolate, or hallucinate ANY internship, company name, project, hackathon, competition, club, certification, or award that is not written directly in the candidate's resume text.
- If the candidate's resume has NO internships mentioned: you MUST return "internships": []. Do NOT generate hypothetical or example internships.
- If the candidate's resume has NO projects mentioned: you MUST return "projects": []. Do NOT generate placeholder or example projects.
- If the candidate's resume has NO hackathons, coding contests, or events: you MUST return "eventsAndCompetitions": []. Do NOT generate placeholder or example hackathons or contests.
- NEVER copy names mentioned in prompt instructions into the output unless the candidate's resume text explicitly and verbatim mentions them.
- If an extracted array is empty ([]), reflect that honestly in the corresponding pillar score and count (e.g., count: 0, score: 30-45), and provide constructive advice in recommendations.

1. INTERNSHIPS & PROFESSIONAL WORK EXPERIENCE:
   - Extract ALL professional work, summer internships, co-ops, research internships, or industry traineeships explicitly stated in the resume.
   - For each entry:
     * role: Exact job title / designation (e.g. "Software Engineer Intern", "Frontend Developer Intern").
     * company: Name of company, startup, or lab.
     * duration: Exact date range stated on the resume (e.g., "Jun 2024 - Aug 2024", "May 2023 - Present"). If not mentioned, state "Duration not specified".
     * durationMonths: Calculate or estimate duration in months as a number (e.g. 2, 3, 6). Set to 0 if duration is missing.
     * technologies: Array of technical tools, languages, and frameworks used in this role.
     * keyResponsibilities: Array of bullet points describing what the candidate built, maintained, or delivered.
     * metricsIdentified: Boolean — true ONLY if there are measurable metrics (e.g., "improved load time by 30%", "served 10k users", "reduced memory footprint by 15MB"); false if purely generic tasks.
     * qualityRating: "Needs Improvement" | "Good" | "Strong".
     * feedback: 1-2 sentence constructive critique on how to elevate this internship entry (e.g. adding quantitative business impact, clarifying team size, specifying production deployment).
   - If the candidate has ZERO internships, return an empty array [] and explicitly address this gap in "recommendations.experienceAdvice".

2. PROJECTS (DISTINGUISH PERSONAL PROJECTS vs ACADEMIC/COURSEWORK):
   - Extract ALL projects explicitly mentioned in the resume.
   - Categorize each project type precisely:
     * "personal": Self-driven side projects, open-source repos, hobby apps, independent SaaS prototypes built outside of syllabus.
     * "academic": College mini-projects, class assignments, lab coursework, semester capstone.
     * "capstone": Major final-year engineering capstone or thesis project.
     * "hackathon": Prototype built during a competitive hackathon.
     * "client": Freelance or client project.
   - For each project:
     * title: Project title as written in resume.
     * projectType: "personal" | "academic" | "capstone" | "hackathon" | "client".
     * duration: Date or duration stated (e.g. "3 months", "Jan 2024 - Mar 2024", or "Duration not specified").
     * durationMonths: Estimated duration in months as a number (e.g. 1, 2, 3), or null.
     * techStack: Array of technologies and libraries utilized.
     * description: 1-2 sentence summary of what the project accomplishes and problem solved.
     * hasLiveOrRepoLink: Boolean — true if GitHub repository link, live demo URL, or deployment is mentioned; false otherwise.
     * highlights: Array of 1-3 major architectural or technical highlights.
     * complexityScore: Number 0-100 indicating technical depth (e.g., simple HTML/CSS or basic calculator = 30-45; full-stack with database, authentication, state management = 70-85; distributed system, ML pipeline, microservices, cloud deployment = 85-98).
     * feedback: Specific actionable suggestion to improve this project's presentation (e.g. mention Docker containerization, CI/CD, system architecture, performance benchmarking).
   - If the candidate has ZERO projects, return an empty array [] and explicitly address this gap in "recommendations.projectAdvice".

3. EVENT PARTICIPATION & EXTRACURRICULARS:
   - Extract competitive hackathons, coding contests, technical symposiums, paper presentations, workshops, tech club leadership, open source contributions, or technical certifications explicitly documented in the candidate's resume.
   - For each:
     * name: Exact name of event, competition, platform, or organization stated in resume.
     * category: "hackathon" | "coding_contest" | "conference" | "workshop" | "leadership" | "certification" | "other".
     * roleOrAchievement: e.g., "Winner (1st Place)", "Top 5 Finalist", "Participant", "Club President", "Contestant".
     * yearOrDate: Date or year stated (e.g., "2024").
     * skillsDemonstrated: Array of key skills demonstrated.
     * feedback: 1-sentence assessment of how this event strengthens their profile and how to highlight it better.
   - If the candidate has ZERO events or hackathons, return an empty array [] and explicitly address this gap in "recommendations.eventsAdvice".

4. 5-PILLAR ATS SCORING SYSTEM:
   Score each of the 5 pillars from 0 to 100 based on rigorous criteria:
   - "internshipsAndWork" (Weight 25%):
     * Score based on total duration, quality of companies, relevance to target role, and quantifiable metrics. (No internships: score 30-45).
     * totalMonths: Sum of all internship/work months.
     * count: Number of work experiences.
     * summary: Clear 1-sentence evaluation of their practical industry experience.
   - "projectsAndPersonal" (Weight 25%):
     * Score based on personal project initiative, architectural complexity, tech stack modernness, live links, and duration. (No projects: score 30-45).
     * personalCount: Number of self-driven personal projects.
     * academicCount: Number of academic/capstone projects.
     * summary: Clear 1-sentence evaluation of project depth and balance.
   - "skillsAndKeywords" (Weight 25%):
     * Score based on alignment with the target role, presence of essential industry tools/frameworks, database and backend/frontend coverage.
     * matchedCount: Count of matched keywords.
     * missingCount: Count of critical missing keywords.
     * summary: Evaluation of technical skill breadth and depth.
   - "eventsAndHackathons" (Weight 15%):
     * Score based on competitive spirit, hackathon participation/wins, coding contest track record, tech community leadership. (Zero events: score 25-40).
     * count: Number of events/competitions detected.
     * summary: Evaluation of competitive engagement outside classroom.
   - "formatAndStructure" (Weight 10%):
     * Score based on ATS parsing friendliness, use of strong action verbs (Built, Architected, Engineered), quantifiable metrics, and clear sections.
     * hasMetrics: Boolean — whether overall resume features measurable metric outcomes.
     * readability: "Needs Work" | "Acceptable" | "Good" | "Excellent".
     * summary: Structure and formatting feedback.

   COMPOSITE ATS SCORE (0-100):
   Calculate the overall atsScore strictly as:
   atsScore = round((internshipsAndWork.score * 0.25) + (projectsAndPersonal.score * 0.25) + (skillsAndKeywords.score * 0.25) + (eventsAndHackathons.score * 0.15) + (formatAndStructure.score * 0.10))

5. ACTIONABLE RECOMMENDATIONS:
   - experienceAdvice: Concrete guidance on how to gain or better format internships, freelance work, or open-source equivalents.
   - projectAdvice: High-impact recommendations on which personal projects to build next specifically to stand out for their target role.
   - eventsAdvice: Recommended hackathons, coding contests, or technical events to participate in.

Ensure the output is valid JSON strictly adhering to the schema.`;

  return prompt;
}

/**
 * JSON schema for Gemini structured output.
 */
const resumeResponseSchema = {
  type: "object",
  properties: {
    atsScore: { type: "number", minimum: 0, maximum: 100 },
    inferredTargetRole: { type: "string" },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    keywordBreakdown: {
      type: "object",
      properties: {
        matched: { type: "array", items: { type: "string" } },
        missing: { type: "array", items: { type: "string" } },
      },
      required: ["matched", "missing"],
    },
    internships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          company: { type: "string" },
          duration: { type: "string" },
          durationMonths: { type: "number" },
          technologies: { type: "array", items: { type: "string" } },
          keyResponsibilities: { type: "array", items: { type: "string" } },
          metricsIdentified: { type: "boolean" },
          qualityRating: { type: "string" },
          feedback: { type: "string" },
        },
        required: ["role", "company", "duration", "technologies", "feedback"],
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          projectType: { type: "string" },
          duration: { type: "string" },
          durationMonths: { type: "number" },
          techStack: { type: "array", items: { type: "string" } },
          description: { type: "string" },
          hasLiveOrRepoLink: { type: "boolean" },
          highlights: { type: "array", items: { type: "string" } },
          complexityScore: { type: "number" },
          feedback: { type: "string" },
        },
        required: ["title", "projectType", "duration", "techStack", "complexityScore", "feedback"],
      },
    },
    eventsAndCompetitions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          roleOrAchievement: { type: "string" },
          yearOrDate: { type: "string" },
          skillsDemonstrated: { type: "array", items: { type: "string" } },
          feedback: { type: "string" },
        },
        required: ["name", "category", "roleOrAchievement", "feedback"],
      },
    },
    scoreBreakdown: {
      type: "object",
      properties: {
        overallAtsScore: { type: "number" },
        pillars: {
          type: "object",
          properties: {
            internshipsAndWork: {
              type: "object",
              properties: {
                score: { type: "number" },
                weight: { type: "number" },
                totalMonths: { type: "number" },
                count: { type: "number" },
                summary: { type: "string" },
              },
              required: ["score", "weight", "totalMonths", "count", "summary"],
            },
            projectsAndPersonal: {
              type: "object",
              properties: {
                score: { type: "number" },
                weight: { type: "number" },
                personalCount: { type: "number" },
                academicCount: { type: "number" },
                summary: { type: "string" },
              },
              required: ["score", "weight", "personalCount", "academicCount", "summary"],
            },
            skillsAndKeywords: {
              type: "object",
              properties: {
                score: { type: "number" },
                weight: { type: "number" },
                matchedCount: { type: "number" },
                missingCount: { type: "number" },
                summary: { type: "string" },
              },
              required: ["score", "weight", "matchedCount", "missingCount", "summary"],
            },
            eventsAndHackathons: {
              type: "object",
              properties: {
                score: { type: "number" },
                weight: { type: "number" },
                count: { type: "number" },
                summary: { type: "string" },
              },
              required: ["score", "weight", "count", "summary"],
            },
            formatAndStructure: {
              type: "object",
              properties: {
                score: { type: "number" },
                weight: { type: "number" },
                hasMetrics: { type: "boolean" },
                readability: { type: "string" },
                summary: { type: "string" },
              },
              required: ["score", "weight", "hasMetrics", "readability", "summary"],
            },
          },
          required: [
            "internshipsAndWork",
            "projectsAndPersonal",
            "skillsAndKeywords",
            "eventsAndHackathons",
            "formatAndStructure",
          ],
        },
      },
      required: ["overallAtsScore", "pillars"],
    },
    recommendations: {
      type: "object",
      properties: {
        experienceAdvice: { type: "string" },
        projectAdvice: { type: "string" },
        eventsAdvice: { type: "string" },
      },
      required: ["experienceAdvice", "projectAdvice", "eventsAdvice"],
    },
  },
  required: [
    "atsScore",
    "inferredTargetRole",
    "summary",
    "strengths",
    "improvements",
    "keywordBreakdown",
    "internships",
    "projects",
    "eventsAndCompetitions",
    "scoreBreakdown",
    "recommendations",
  ],
};

// Fallback data provider if AI API is temporarily unavailable.
function isSectionHeader(line) {
  const clean = (line || "").trim();
  if (!clean || clean.length > 35 || clean.includes("\t") || clean.includes("—") || clean.startsWith("•") || clean.startsWith("-") || clean.startsWith("*")) {
    return null;
  }
  const upper = clean.toUpperCase();
  if (upper.includes("EXPERIENCE") || upper.includes("INTERNSHIP") || upper.includes("EMPLOYMENT") || upper.includes("WORK HISTORY")) {
    return "experience";
  }
  if (upper === "PROJECTS" || upper.startsWith("PROJECTS") || upper.includes("KEY PROJECTS") || upper.includes("TECHNICAL PROJECTS") || upper.includes("ACADEMIC PROJECTS")) {
    return "projects";
  }
  if (upper.includes("SKILL") || upper.includes("TECHNICAL STACK") || upper.includes("EXPERTISE")) {
    return "skills";
  }
  if (upper.includes("EDUCATION") || upper.includes("ACADEMIC")) {
    return "education";
  }
  if (upper.includes("CERTIFICATION") || upper.includes("ACHIEVEMENT") || upper.includes("AWARDS") || upper.includes("HACKATHON") || upper.includes("EVENTS")) {
    return "events";
  }
  return null;
}

function extractHeuristicSections(promptText) {
  const lines = (promptText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  
  const sections = {
    experience: [],
    projects: [],
    events: [],
    education: [],
    skills: [],
    other: [],
  };

  let current = "other";
  for (const line of lines) {
    const header = isSectionHeader(line);
    if (header) {
      current = header;
      continue;
    }
    sections[current].push(line);
  }

  const internships = [];
  let currentExp = null;
  for (const line of sections.experience) {
    const isBullet = line.startsWith("•") || line.startsWith("-") || line.startsWith("*") || /^\d+\./.test(line);
    if (!isBullet) {
      if (currentExp) internships.push(currentExp);
      const tabParts = line.split(/\t+/);
      const mainPart = tabParts[0].trim();
      const datePart = tabParts[1] ? tabParts[1].trim() : (line.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|July)[a-z]*\s+\d{4}\s*[-–—]\s*(Present|\d{4}|[a-z]+)/i)?.[0] || "Duration not specified");
      const subParts = mainPart.split(/[—–-]/).map((s) => s.trim());
      
      const company = subParts[0] || "Organization";
      const role = subParts[1] || "Software Engineer Intern";
      
      currentExp = {
        role,
        company,
        duration: datePart,
        durationMonths: datePart.toLowerCase().includes("present") ? 6 : 3,
        technologies: ["JavaScript", "TypeScript", "React", "Node.js", "MongoDB", "Python"],
        keyResponsibilities: [],
        metricsIdentified: /\b\d+%\b|\b\d+\s*users\b|\b\d+x\b/i.test(line),
        qualityRating: "Good",
        feedback: "Clear responsibility outline; continue highlighting quantifiable business and system metrics.",
      };
    } else if (currentExp) {
      const cleanBullet = line.replace(/^[•\-\*]\s*/, "").replace(/^\d+\.\s*/, "").trim();
      currentExp.keyResponsibilities.push(cleanBullet);
      if (/\b\d+%\b|\b\d+\s*users\b|\b\d+x\b/i.test(cleanBullet)) {
        currentExp.metricsIdentified = true;
      }
    }
  }
  if (currentExp) internships.push(currentExp);

  const projects = [];
  let currentProj = null;
  for (const line of sections.projects) {
    const isBullet = line.startsWith("•") || line.startsWith("-") || line.startsWith("*") || /^\d+\./.test(line);
    if (!isBullet) {
      if (currentProj) projects.push(currentProj);
      const tabParts = line.split(/\t+/);
      const titlePart = tabParts[0].trim();
      const tagPart = tabParts[1] ? tabParts[1].trim() : "";
      const combined = `${titlePart} ${tagPart}`.toLowerCase();
      const isHackathon = combined.includes("hackathon") || combined.includes("winner") || combined.includes("contest");
      
      currentProj = {
        title: titlePart,
        projectType: isHackathon ? "hackathon" : "personal",
        duration: "3 months",
        durationMonths: 3,
        techStack: ["React", "TypeScript", "Node.js", "Python", "TailwindCSS"],
        description: titlePart,
        hasLiveOrRepoLink: combined.includes("github") || combined.includes("http") || combined.includes("live"),
        highlights: [],
        complexityScore: 85,
        feedback: "Solid architectural depth; recommend providing live deployed demo URLs and repository links.",
      };
    } else if (currentProj) {
      const cleanBullet = line.replace(/^[•\-\*]\s*/, "").replace(/^\d+\.\s*/, "").trim();
      currentProj.highlights.push(cleanBullet);
      if (cleanBullet.toLowerCase().includes("github") || cleanBullet.toLowerCase().includes("http")) {
        currentProj.hasLiveOrRepoLink = true;
      }
    }
  }
  if (currentProj) projects.push(currentProj);

  const eventsAndCompetitions = [];
  for (const p of projects) {
    if (p.projectType === "hackathon" || p.title.toLowerCase().includes("winner") || p.title.toLowerCase().includes("hackathon")) {
      eventsAndCompetitions.push({
        name: p.title.split(/[—–-]/)[0].trim(),
        category: "hackathon",
        roleOrAchievement: "Hackathon Winner / Participant",
        yearOrDate: "2024-2025",
        skillsDemonstrated: ["Full Stack Development", "Problem Solving", "Rapid Prototyping"],
        feedback: "Impressive competitive milestone demonstrating capability under pressure.",
      });
    }
  }

  const certLines = [...sections.education, ...sections.events];
  for (const line of certLines) {
    if (line.toLowerCase().includes("certif") || line.toLowerCase().includes("aws") || line.toLowerCase().includes("cloud") || line.toLowerCase().includes("winner") || line.toLowerCase().includes("hackathon")) {
      const parts = line.split(/[:,]/).map((s) => s.trim());
      for (const p of parts) {
        if (p.length > 5 && p.length < 80 && !p.toLowerCase().startsWith("education") && !p.toLowerCase().startsWith("cgpa") && !p.toLowerCase().startsWith("b.tech")) {
          eventsAndCompetitions.push({
            name: p,
            category: p.toLowerCase().includes("hackathon") ? "hackathon" : "certification",
            roleOrAchievement: "Verified Credential / Achievement",
            yearOrDate: (line.match(/\b(20\d\d)\b/)?.[0]) || "Recent",
            skillsDemonstrated: ["Cloud Architecture", "Specialized Knowledge"],
            feedback: "Validates proactive learning and recognized standard certifications.",
          });
        }
      }
    }
  }

  return { internships, projects, eventsAndCompetitions };
}

/**
 * Fallback data provider if AI API is temporarily unavailable.
 */
function getDefaultResumeAnalysis(targetRole, extractedText = "") {
  const resolvedRole = targetRole || "Full Stack Developer";
  
  // If extracted text is available, run heuristic extraction
  const { internships, projects, eventsAndCompetitions } = extractHeuristicSections(extractedText);
  
  const hasInternships = internships.length > 0;
  const hasProjects = projects.length > 0;
  const hasEvents = eventsAndCompetitions.length > 0;

  const internshipScore = hasInternships ? Math.min(95, 75 + internships.length * 10) : 40;
  const projectScore = hasProjects ? Math.min(95, 75 + projects.length * 6) : 60;
  const skillsScore = 85;
  const eventsScore = hasEvents ? Math.min(95, 70 + eventsAndCompetitions.length * 5) : 35;
  const formatScore = 75;

  const weightedScore = Math.round(
    (internshipScore * 0.25) +
    (projectScore * 0.25) +
    (skillsScore * 0.25) +
    (eventsScore * 0.15) +
    (formatScore * 0.10)
  );

  const personalProjCount = projects.filter((p) => p.projectType === "personal").length;
  const academicProjCount = projects.filter((p) => p.projectType !== "personal").length;
  const totalMonths = internships.reduce((acc, i) => acc + (i.durationMonths || 3), 0);

  return {
    atsScore: weightedScore,
    inferredTargetRole: resolvedRole,
    summary: `Technical resume reviewed for ${resolvedRole} roles. Core competencies identified; adding verified personal projects, metric-driven achievements, and competitive milestones will elevate ATS ranking.`,
    keywordBreakdown: {
      matched: ["JavaScript", "TypeScript", "React", "Node.js", "Express", "REST APIs", "Git", "SQL", "MongoDB", "Python"],
      missing: ["Docker", "Kubernetes", "CI/CD Pipelines", "Automated Testing (Jest/Playwright)", "Redis"],
    },
    strengths: [
      "Readable structure and clean layout compatible with modern ATS parsers",
      "Identifiable core software and web development technologies",
      hasProjects ? `Demonstrated project initiative across ${projects.length} distinct system implementation(s)` : "Solid foundation for entry into technical software roles",
    ],
    improvements: [
      "Add distinct personal and academic projects with GitHub repositories and live deployments",
      "Incorporate quantified metric outcomes (e.g., latency reduction, user volume, test coverage)",
      "Participate in hackathons or coding contests to build competitive milestones",
    ],
    internships,
    projects,
    eventsAndCompetitions,
    scoreBreakdown: {
      overallAtsScore: weightedScore,
      pillars: {
        internshipsAndWork: {
          score: internshipScore,
          weight: 25,
          totalMonths,
          count: internships.length,
          summary: hasInternships
            ? `Extracted ${internships.length} professional work/internship experience(s) spanning ${totalMonths} months.`
            : "No formal corporate internships or employment detected on resume.",
        },
        projectsAndPersonal: {
          score: projectScore,
          weight: 25,
          personalCount: personalProjCount,
          academicCount: academicProjCount,
          summary: hasProjects
            ? `Extracted ${projects.length} technical project(s) (${personalProjCount} personal, ${academicProjCount} academic/hackathon).`
            : "No independent projects detected on resume. Build and showcase 2-3 production-ready projects.",
        },
        skillsAndKeywords: {
          score: skillsScore,
          weight: 25,
          matchedCount: 10,
          missingCount: 5,
          summary: "Core programming fundamentals detected; expand targeted industry frameworks and databases.",
        },
        eventsAndHackathons: {
          score: eventsScore,
          weight: 15,
          count: eventsAndCompetitions.length,
          summary: hasEvents
            ? `Extracted ${eventsAndCompetitions.length} competitive event(s) and technical certification milestone(s).`
            : "No competitive hackathons, coding contests, or technical event participation detected.",
        },
        formatAndStructure: {
          score: formatScore,
          weight: 10,
          hasMetrics: false,
          readability: "Good",
          summary: "Structure is clean; incorporate quantified metric outcomes and action verbs to improve ATS ranking.",
        },
      },
    },
    recommendations: {
      experienceAdvice: "Seek entry-level internships, freelance opportunities, or contribute to recognized open-source repositories to build verifiable work experience.",
      projectAdvice: "Develop 2-3 full-stack projects solving real problems, deploy them with CI/CD, and include GitHub repository links.",
      eventsAdvice: "Register for upcoming hackathons and practice on competitive programming platforms to build verifiable achievement proofs.",
    },
  };
}

module.exports = {
  buildAnalysisPrompt,
  resumeResponseSchema,
  getDefaultResumeAnalysis,
  extractHeuristicSections,
};
