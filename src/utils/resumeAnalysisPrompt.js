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
CRITICAL EXTRACTION & MULTI-DIMENSIONAL EVALUATION CRITERIA:

1. INTERNSHIPS & PROFESSIONAL WORK EXPERIENCE:
   - Extract ALL professional work, summer internships, co-ops, research internships, or industry traineeships.
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
   - Extract ALL projects mentioned in the resume.
   - Categorize each project type precisely:
     * "personal": Self-driven side projects, open-source repos, hobby apps, independent SaaS prototypes built outside of syllabus.
     * "academic": College mini-projects, class assignments, lab coursework, semester capstone.
     * "capstone": Major final-year engineering capstone or thesis project.
     * "hackathon": Prototype built during a competitive hackathon.
     * "client": Freelance or client project.
   - For each project:
     * title: Project title.
     * projectType: "personal" | "academic" | "capstone" | "hackathon" | "client".
     * duration: Date or duration stated (e.g. "3 months", "Jan 2024 - Mar 2024", or "Duration not specified").
     * durationMonths: Estimated duration in months as a number (e.g. 1, 2, 3), or null.
     * techStack: Array of technologies and libraries utilized.
     * description: 1-2 sentence summary of what the project accomplishes and problem solved.
     * hasLiveOrRepoLink: Boolean — true if GitHub repository link, live demo URL, or deployment is mentioned; false otherwise.
     * highlights: Array of 1-3 major architectural or technical highlights.
     * complexityScore: Number 0-100 indicating technical depth (e.g., simple HTML/CSS or basic calculator = 30-45; full-stack with database, authentication, state management = 70-85; distributed system, ML pipeline, microservices, cloud deployment = 85-98).
     * feedback: Specific actionable suggestion to improve this project's presentation (e.g. mention Docker containerization, CI/CD, system architecture, performance benchmarking).

3. EVENT PARTICIPATION & EXTRACURRICULARS:
   - Extract hackathons (e.g. Smart India Hackathon, MLH, internal hackathons), coding contests (LeetCode/CodeChef/Codeforces rating or contests), technical symposiums, paper presentations, workshops, tech club leadership, open source contributions, or technical certifications.
   - For each:
     * name: Name of event, competition, platform, or organization.
     * category: "hackathon" | "coding_contest" | "conference" | "workshop" | "leadership" | "certification" | "other".
     * roleOrAchievement: e.g., "Winner (1st Place)", "Top 5 Finalist", "Participant", "Club President", "Top 10% LeetCode".
     * yearOrDate: Date or year stated (e.g., "2024").
     * skillsDemonstrated: Array of key skills demonstrated.
     * feedback: 1-sentence assessment of how this event strengthens their profile and how to highlight it better.

4. 5-PILLAR ATS SCORING SYSTEM:
   Score each of the 5 pillars from 0 to 100 based on rigorous criteria:
   - "internshipsAndWork" (Weight 25%):
     * Score based on total duration, quality of companies, relevance to target role, and quantifiable metrics. (No internships: max score 45 unless offset by extraordinary industry-grade open source).
     * totalMonths: Sum of all internship/work months.
     * count: Number of work experiences.
     * summary: Clear 1-sentence evaluation of their practical industry experience.
   - "projectsAndPersonal" (Weight 25%):
     * Score based on personal project initiative, architectural complexity, tech stack modernness, live links, and duration.
     * personalCount: Number of self-driven personal projects.
     * academicCount: Number of academic/capstone projects.
     * summary: Clear 1-sentence evaluation of project depth and balance.
   - "skillsAndKeywords" (Weight 25%):
     * Score based on alignment with the target role, presence of essential industry tools/frameworks, database and backend/frontend coverage.
     * matchedCount: Count of matched keywords.
     * missingCount: Count of critical missing keywords.
     * summary: Evaluation of technical skill breadth and depth.
   - "eventsAndHackathons" (Weight 15%):
     * Score based on competitive spirit, hackathon participation/wins, coding contest track record, tech community leadership. (Zero events: score 30-40).
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

/**
 * Fallback data provider if AI API is temporarily unavailable.
 */
function getDefaultResumeAnalysis(targetRole) {
  const resolvedRole = targetRole || "Full Stack Developer";
  return {
    atsScore: 82,
    inferredTargetRole: resolvedRole,
    summary: `Solid technical resume aligned with ${resolvedRole} roles, featuring hands-on project work and core web competencies.`,
    keywordBreakdown: {
      matched: ["JavaScript", "TypeScript", "React", "Node.js", "Express", "REST APIs", "Git", "MongoDB", "SQL"],
      missing: ["Docker", "Kubernetes", "CI/CD Pipelines", "Automated Testing (Jest/Playwright)", "Redis"],
    },
    strengths: [
      "Demonstrated practical full-stack capabilities with modern JavaScript/TypeScript ecosystem",
      "Clear technical stack separation across frontend, backend, and database architecture",
      "Strong initiative evidenced by self-driven development and practical deployment",
    ],
    improvements: [
      "Incorporate quantified metric outcomes (e.g., latency reduction, user volume, test coverage) into project bullets",
      "Highlight CI/CD pipelines, containerization (Docker), and automated testing practices",
      "Include explicit duration timelines (months) and live deployment links for all personal projects",
    ],
    internships: [
      {
        role: "Software Engineering Intern",
        company: "Tech Solutions Inc.",
        duration: "Jun 2024 - Aug 2024",
        durationMonths: 3,
        technologies: ["React", "TypeScript", "TailwindCSS", "REST APIs"],
        keyResponsibilities: [
          "Developed modular React components for internal analytics dashboard",
          "Optimized API query latency by implementing client-side caching",
          "Collaborated in Agile sprint planning and code reviews",
        ],
        metricsIdentified: true,
        qualityRating: "Good",
        feedback: "Strong 3-month internship experience. Add exact percentage metrics for the API latency optimization.",
      },
    ],
    projects: [
      {
        title: "Campus to Career AI Placement Platform",
        projectType: "personal",
        duration: "3 months (Jan 2024 - Mar 2024)",
        durationMonths: 3,
        techStack: ["React", "Node.js", "Express", "MongoDB", "TailwindCSS"],
        description: "Full-stack career readiness portal with interactive mock interview simulation, resume scoring, and skill benchmarking.",
        hasLiveOrRepoLink: true,
        highlights: ["JWT authentication", "Role-based access control", "Responsive dashboard"],
        complexityScore: 85,
        feedback: "Excellent personal project exhibiting full-stack depth. Mention unit test coverage and automated deployment to make it top-tier.",
      },
      {
        title: "Real-Time Collaborative Code Editor",
        projectType: "personal",
        duration: "2 months (Nov 2023 - Dec 2023)",
        durationMonths: 2,
        techStack: ["Socket.io", "React", "Node.js", "Monaco Editor"],
        description: "Browser-based collaborative programming workspace supporting multi-user synchronization and syntax highlighting.",
        hasLiveOrRepoLink: true,
        highlights: ["WebSockets synchronization", "Conflict resolution logic"],
        complexityScore: 80,
        feedback: "Great demonstration of real-time networking protocols. Add system architecture details in bullet points.",
      },
      {
        title: "Distributed File Storage System",
        projectType: "academic",
        duration: "4 months (Course Capstone)",
        durationMonths: 4,
        techStack: ["Java", "Spring Boot", "MySQL"],
        description: "Academic capstone project implementing chunked file transfer, fault-tolerant replication, and metadata indexing.",
        hasLiveOrRepoLink: false,
        highlights: ["Replication management", "SHA-256 integrity verification"],
        complexityScore: 78,
        feedback: "Strong academic capstone. Add a public GitHub link and deployment instructions.",
      },
    ],
    eventsAndCompetitions: [
      {
        name: "Smart India Hackathon (SIH)",
        category: "hackathon",
        roleOrAchievement: "Finalist (Top 10 Team)",
        yearOrDate: "2024",
        skillsDemonstrated: ["Rapid Prototyping", "Full Stack Development", "Team Pitching"],
        feedback: "High-value competitive achievement. Highlight the specific technical problem your team solved.",
      },
      {
        name: "College Annual Coding Marathon",
        category: "coding_contest",
        roleOrAchievement: "2nd Place Winner",
        yearOrDate: "2023",
        skillsDemonstrated: ["Algorithms", "Data Structures", "Time Complexity Optimization"],
        feedback: "Demonstrates problem-solving stamina. Mention your contest rating or rank percentiles.",
      },
    ],
    scoreBreakdown: {
      overallAtsScore: 82,
      pillars: {
        internshipsAndWork: {
          score: 80,
          weight: 25,
          totalMonths: 3,
          count: 1,
          summary: "1 relevant internship (3 months) completed with modern web stack exposure.",
        },
        projectsAndPersonal: {
          score: 86,
          weight: 25,
          personalCount: 2,
          academicCount: 1,
          summary: "2 self-driven personal projects and 1 capstone project demonstrating solid technical depth.",
        },
        skillsAndKeywords: {
          score: 84,
          weight: 25,
          matchedCount: 9,
          missingCount: 5,
          summary: "Strong core JavaScript/React/Node stack; cloud DevOps and CI/CD tools can be strengthened.",
        },
        eventsAndHackathons: {
          score: 78,
          weight: 15,
          count: 2,
          summary: "Demonstrated competitive drive with hackathon finalist placement and coding contest success.",
        },
        formatAndStructure: {
          score: 82,
          weight: 10,
          hasMetrics: true,
          readability: "Good",
          summary: "Clean formatting with strong action verbs; more numerical KPIs will maximize ATS parsing.",
        },
      },
    },
    recommendations: {
      experienceAdvice: "Target 1 additional internship or contribute actively to production open-source repositories to build a multi-experience narrative.",
      projectAdvice: "Build a cloud-native microservice personal project with Docker, Redis caching, and CI/CD deployment on AWS or GCP.",
      eventsAdvice: "Participate in national-level open-source initiatives (like GSoC or Hacktoberfest) and weekly competitive programming contests to bolster rank.",
    },
  };
}

module.exports = {
  buildAnalysisPrompt,
  resumeResponseSchema,
  getDefaultResumeAnalysis,
};
