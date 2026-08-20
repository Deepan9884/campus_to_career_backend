/**
 * Seed script for the Interview question bank.
 *
 * Usage:
 *   node backend/scripts/seedQuestions.js             # insert only missing questions
 *   node backend/scripts/seedQuestions.js --force     # clear all questions then reseed
 *
 * Idempotent: skips questions where questionText already exists.
 */

const mongoose = require("mongoose");
const path = require("path");

// Load env before anything else
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const Question = require("../src/models/Question.model");

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in environment / .env");
  process.exit(1);
}

const behavioralQuestions = [
  {
    category: "teamwork",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Tell me about a time you had to work closely with a teammate you disagreed with. How did you handle it?",
    idealAnswerPoints: [
      "Describes the disagreement clearly and professionally",
      "Shows active listening and respect for different viewpoints",
      "Explains how they found common ground or compromise",
      "Reflects on what they learned from the experience",
    ],
  },
  {
    category: "conflict-resolution",
    difficulty: "hard",
    targetRoles: [],
    questionText:
      "Describe a situation where a project you were leading faced significant opposition from stakeholders. How did you navigate the conflict?",
    idealAnswerPoints: [
      "Identifies the root cause of stakeholder opposition",
      "Demonstrates empathy and understanding of stakeholder concerns",
      "Shows structured approach to presenting data or alternatives",
      "Achieved a resolution that balanced competing priorities",
    ],
  },
  {
    category: "failure-learning",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Tell me about a time you made a mistake that had a significant impact on a project. What happened and what did you learn?",
    idealAnswerPoints: [
      "Takes ownership without deflecting blame",
      "Explains the mistake clearly and its consequences",
      "Describes specific steps taken to remediate the issue",
      "Articulates a concrete lesson that changed their behavior",
    ],
  },
  {
    category: "leadership",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Give me an example of a time you mentored or helped a colleague grow their skills. What approach did you take?",
    idealAnswerPoints: [
      "Identified a specific skill gap the colleague had",
      "Used structured mentoring techniques (pairing, code review, etc.)",
      "Shows patience and adapted approach to the learner's style",
      "Measured or observed improvement over time",
    ],
  },
  {
    category: "communication",
    difficulty: "easy",
    targetRoles: [],
    questionText:
      "Describe a time when you had to explain a complex technical concept to a non-technical audience. How did you ensure they understood?",
    idealAnswerPoints: [
      "Avoided jargon and used analogies relevant to the audience",
      "Checked for understanding through questions or feedback",
      "Adjusted communication style based on audience reactions",
      "The audience was able to make informed decisions afterward",
    ],
  },
  {
    category: "prioritization",
    difficulty: "hard",
    targetRoles: [],
    questionText:
      "Tell me about a time when you had multiple urgent deadlines with conflicting priorities. How did you decide what to work on first?",
    idealAnswerPoints: [
      "Used a structured framework (impact vs. effort, MoSCoW, etc.)",
      "Communicated trade-offs clearly to stakeholders",
      "Negotiated deadlines or scope when necessary",
      "Delivered on the most critical items without burning out",
    ],
  },
  {
    category: "initiative",
    difficulty: "easy",
    targetRoles: [],
    questionText:
      "Tell me about a time you identified a problem that no one else had noticed and took the initiative to fix it.",
    idealAnswerPoints: [
      "Describes how they discovered the problem proactively",
      "Shows ownership beyond their defined responsibilities",
      "Explains the solution they implemented",
      "Quantifies the impact of their initiative",
    ],
  },
  {
    category: "adaptability",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Describe a time when the requirements of a project changed significantly midway through. How did you adapt?",
    idealAnswerPoints: [
      "Acknowledges the initial challenge or frustration",
      "Shows flexibility in reassessing the plan",
      "Explains how they communicated changes to the team",
      "Completed the project successfully despite the pivot",
    ],
  },
  {
    category: "teamwork",
    difficulty: "easy",
    targetRoles: [],
    questionText:
      "Give me an example of a successful team project you were part of. What was your specific contribution?",
    idealAnswerPoints: [
      "Clearly defines their role in the team",
      "Highlights a concrete contribution they made",
      "Demonstrates collaboration and coordination skills",
      "Connects their contribution to the team's overall success",
    ],
  },
  {
    category: "leadership",
    difficulty: "hard",
    targetRoles: [],
    questionText:
      "Tell me about a time you had to lead a team through a period of uncertainty or change. How did you keep the team motivated?",
    idealAnswerPoints: [
      "Acknowledged the uncertainty transparently",
      "Provided clear, frequent communication",
      "Empowered team members to contribute ideas",
      "Maintained morale and delivered results despite challenges",
    ],
  },
  {
    category: "conflict-resolution",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Describe a time when you received critical feedback that you initially disagreed with. How did you respond?",
    idealAnswerPoints: [
      "Listened without becoming defensive",
      "Took time to reflect before responding",
      "Found valid points in the feedback and acted on them",
      "Strengthened the working relationship through the exchange",
    ],
  },
  {
    category: "communication",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Tell me about a time your written communication (email, doc, proposal) was misunderstood. How did you resolve it?",
    idealAnswerPoints: [
      "Recognized the misunderstanding quickly",
      "Clarified in person or with a revised document",
      "Adjusted their communication style for future interactions",
      "The misunderstanding was resolved without lasting impact",
    ],
  },
  {
    category: "prioritization",
    difficulty: "easy",
    targetRoles: [],
    questionText:
      "How do you organize your workday to stay productive? Give a concrete example of a day you managed well.",
    idealAnswerPoints: [
      "Describes a specific system (time-blocking, task lists, etc.)",
      "Shows how they distinguish urgent from important tasks",
      "Managed interruptions without derailing priorities",
      "Completed the most important tasks by end of day",
    ],
  },
  {
    category: "failure-learning",
    difficulty: "easy",
    targetRoles: [],
    questionText:
      "Tell me about a time you struggled to learn a new technology or skill. How did you overcome it?",
    idealAnswerPoints: [
      "Identifies the specific challenge they faced",
      "Describes their learning strategy (tutorials, mentorship, projects)",
      "Shows persistence through frustration",
      "Ultimately became proficient and applied the skill",
    ],
  },
  {
    category: "initiative",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Describe a time you went beyond your job description to improve a process or tool your team relied on.",
    idealAnswerPoints: [
      "Spotted an inefficiency or pain point in existing workflows",
      "Built or introduced a solution without being asked",
      "The improvement saved time, reduced errors, or improved morale",
      "Their initiative was adopted by the broader team",
    ],
  },
  {
    category: "adaptability",
    difficulty: "hard",
    targetRoles: ["Manager", "Tech Lead"],
    questionText:
      "Tell me about a time you had to take on a role or responsibility you felt unprepared for. How did you succeed?",
    idealAnswerPoints: [
      "Honestly acknowledges their initial lack of confidence",
      "Shows they proactively sought resources and support",
      "Learned quickly through deliberate effort",
      "Delivered results despite the steep learning curve",
    ],
  },
  {
    category: "leadership",
    difficulty: "easy",
    targetRoles: [],
    questionText:
      "Give me an example of a time you helped a teammate who was struggling. What did you do?",
    idealAnswerPoints: [
      "Noticed the colleague was struggling before being asked",
      "Offered help in a respectful, non-judgmental way",
      "Used a specific method (pairing, explaining, resources)",
      "The colleague's performance or confidence improved",
    ],
  },
];

const technicalQuestions = [
  {
    category: "data-structures",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Explain how a hash map works internally. What are the key considerations for choosing between chaining and open addressing?",
    idealAnswerPoints: [
      "Describes the hash function and bucket array",
      "Explains collision resolution strategies",
      "Discusses load factor and rehashing",
      "Compares trade-offs of chaining vs open addressing",
    ],
  },
  {
    category: "algorithms",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Describe the difference between breadth-first search and depth-first search. When would you choose one over the other?",
    idealAnswerPoints: [
      "Explains BFS uses a queue, DFS uses a stack",
      "BFS finds shortest path in unweighted graphs",
      "DFS uses less memory for deep graphs",
      "Provides concrete use cases for each",
    ],
  },
  {
    category: "system-design",
    difficulty: "hard",
    targetRoles: [],
    questionText:
      "How would you design a URL shortening service like bit.ly? Walk through the key components and trade-offs.",
    idealAnswerPoints: [
      "Discusses hash generation and collision handling",
      "Describes read-heavy optimization with caching",
      "Covers database schema and sharding strategy",
      "Addresses redirect latency and analytics tracking",
    ],
  },
  {
    category: "databases",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Explain the difference between SQL and NoSQL databases. What factors would influence your choice between them for a new project?",
    idealAnswerPoints: [
      "SQL: ACID, structured schema, JOINs, vertical scaling",
      "NoSQL: flexible schema, horizontal scaling, eventual consistency",
      "Considers data shape, query patterns, and scale requirements",
      "Provides realistic trade-off analysis, not blanket preference",
    ],
  },
  {
    category: "debugging",
    difficulty: "easy",
    targetRoles: [],
    questionText:
      "Walk me through your systematic approach to debugging a slow API endpoint in production.",
    idealAnswerPoints: [
      "Identifies the slow endpoint with monitoring/APM tools",
      "Checks database query performance and N+1 issues",
      "Profiles the application code for bottlenecks",
      "Implements fix and validates improvement with before/after metrics",
    ],
  },
  {
    category: "data-structures",
    difficulty: "easy",
    targetRoles: [],
    questionText:
      "What is the difference between an array and a linked list? When would you use each one?",
    idealAnswerPoints: [
      "Array: O(1) random access, contiguous memory, fixed size",
      "Linked list: O(n) access, dynamic size, efficient insertions/deletions",
      "Considers cache locality for real-world performance",
      "Provides specific scenarios for each choice",
    ],
  },
  {
    category: "algorithms",
    difficulty: "hard",
    targetRoles: [],
    questionText:
      "Explain how you would design an algorithm to find the k most frequent elements in a large dataset that doesn't fit in memory.",
    idealAnswerPoints: [
      "Discusses MapReduce or external sorting approaches",
      "Describes hash-based frequency counting with partitioning",
      "Uses a heap or selection algorithm for top-k extraction",
      "Addresses memory constraints and I/O optimization",
    ],
  },
  {
    category: "system-design",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "How would you design a chat application that supports real-time messaging across multiple devices?",
    idealAnswerPoints: [
      "Discusses WebSocket or long-polling for real-time updates",
      "Describes message queue for reliable delivery",
      "Covers database schema for multi-device sync",
      "Addresses offline message storage and retrieval",
    ],
  },
  {
    category: "databases",
    difficulty: "hard",
    targetRoles: [],
    questionText:
      "Explain database indexing in detail. How would you choose which columns to index for a given query pattern?",
    idealAnswerPoints: [
      "Describes B-tree and hash index structures",
      "Explains composite indexes and column order importance",
      "Discusses index scan vs table scan trade-offs",
      "Considers write overhead when choosing indexes",
    ],
  },
  {
    category: "debugging",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "A user reports that their data was lost after a database migration. How would you investigate and prevent this from recurring?",
    idealAnswerPoints: [
      "Checks migration logs, backups, and audit trails",
      "Verifies the migration script against expected output",
      "Implements data validation before/after migration hooks",
      "Adds rollback capability and staging environment tests",
    ],
  },
  {
    category: "data-structures",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Describe the trade-offs between using a tree versus a hash table for implementing an in-memory key-value store.",
    idealAnswerPoints: [
      "Hash table: O(1) average, O(n) worst, no ordering",
      "Tree (balanced): O(log n), ordered iteration, range queries",
      "Considers memory overhead for both structures",
      "Recommends based on access patterns (lookup-heavy vs range-heavy)",
    ],
  },
  {
    category: "algorithms",
    difficulty: "easy",
    targetRoles: [],
    questionText:
      "Explain the two-pointer technique. Give an example of a problem where it's the optimal solution.",
    idealAnswerPoints: [
      "Describes using two pointers to traverse in tandem or from ends",
      "Example: finding a pair that sums to target in sorted array",
      "O(n) time, O(1) space advantage",
      "Mentions variants like sliding window",
    ],
  },
  {
    category: "system-design",
    difficulty: "hard",
    targetRoles: [],
    questionText:
      "Design the backend storage system for a photo-sharing app. Consider upload latency, storage cost, and retrieval speed.",
    idealAnswerPoints: [
      "Discusses CDN for fast image delivery",
      "Describes multi-tier storage (hot/warm/cold)",
      "Covers image processing pipeline (thumbnails, compression)",
      "Addresses deduplication and metadata storage",
    ],
  },
  {
    category: "databases",
    difficulty: "easy",
    targetRoles: [],
    questionText:
      "What is the N+1 query problem and how can you avoid it in a typical ORM-based application?",
    idealAnswerPoints: [
      "Defines N+1: one query for parent + N queries for children",
      "Shows how eager loading / JOINs solve it",
      "Demonstrates with a concrete ORM example (select_related, etc.)",
      "Mentions when N+1 might be intentional (pagination scenarios)",
    ],
  },
  {
    category: "debugging",
    difficulty: "hard",
    targetRoles: [],
    questionText:
      "Your application is experiencing intermittent memory leaks in production. How would you systematically identify the root cause?",
    idealAnswerPoints: [
      "Uses heap profiling tools (Valgrind, Chrome DevTools, etc.)",
      "Analyzes heap snapshots for retained objects",
      "Correlates memory growth with specific code paths or features",
      "Implements fix and validates with leak detection in CI",
    ],
  },
  {
    category: "data-structures",
    difficulty: "hard",
    targetRoles: [],
    questionText:
      "Explain how a Trie (prefix tree) works and describe a real-world application where it outperforms a hash table.",
    idealAnswerPoints: [
      "Describes tree structure with shared prefixes",
      "O(L) operations where L is string length (independent of total keys)",
      "Autocomplete / spell-check as prime use case",
      "Hash table is O(1) but cannot do prefix-based lookups efficiently",
    ],
  },
  {
    category: "algorithms",
    difficulty: "medium",
    targetRoles: [],
    questionText:
      "Describe the quicksort algorithm, its time complexity, and a scenario where it performs poorly. How would you mitigate that?",
    idealAnswerPoints: [
      "Explains pivot selection and partition step",
      "Average O(n log n), worst case O(n²) on sorted/reverse input",
      "Mitigation: random pivot or median-of-three selection",
      "Discusses in-place vs stable variants",
    ],
  },
];

const codingQuestions = [
  {
    category: "algorithms",
    difficulty: "easy",
    targetRoles: ["Software Engineer", "Full Stack Engineer", "Backend Engineer"],
    roundType: "coding",
    itemType: "coding",
    questionText: "Two Sum: Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`. Output the two 0-based indices separated by a space.",
    starterCode: "import sys\n\ndef two_sum(nums, target):\n    # Write your solution here\n    seen = {}\n    for i, n in enumerate(nums):\n        diff = target - n\n        if diff in seen:\n            return f\"{seen[diff]} {i}\"\n        seen[n] = i\n    return \"\"\n\nif __name__ == \"__main__\":\n    lines = sys.stdin.read().strip().split('\\n')\n    if len(lines) >= 2:\n        nums = [int(x) for x in lines[0].split()]\n        target = int(lines[1].strip())\n        print(two_sum(nums, target))\n",
    testCases: [
      { input: "2 7 11 15\n9", expectedOutput: "0 1", description: "Standard pair at start" },
      { input: "3 2 4\n6", expectedOutput: "1 2", description: "Target sum in middle" },
      { input: "3 3\n6", expectedOutput: "0 1", description: "Duplicate elements" },
    ],
    idealAnswerPoints: ["O(N) time complexity with Hash Map", "O(N) auxiliary space", "Handles edge cases cleanly"],
  },
  {
    category: "data-structures",
    difficulty: "easy",
    targetRoles: ["Software Engineer", "Frontend Developer", "Full Stack Engineer"],
    roundType: "coding",
    itemType: "coding",
    questionText: "Valid Palindrome: Given a string `s`, determine if it is a palindrome considering only alphanumeric characters and ignoring cases. Print `true` or `false`.",
    starterCode: "import sys\n\ndef is_palindrome(s):\n    cleaned = [c.lower() for c in s if c.isalnum()]\n    return \"true\" if cleaned == cleaned[::-1] else \"false\"\n\nif __name__ == \"__main__\":\n    inp = sys.stdin.read().strip()\n    print(is_palindrome(inp))\n",
    testCases: [
      { input: "A man, a plan, a canal: Panama", expectedOutput: "true", description: "Phrase with punctuation" },
      { input: "race a car", expectedOutput: "false", description: "Non-palindrome" },
      { input: " ", expectedOutput: "true", description: "Empty string" },
    ],
    idealAnswerPoints: ["O(N) time complexity", "Two-pointer approach", "Correct character filtering"],
  },
  {
    category: "algorithms",
    difficulty: "medium",
    targetRoles: ["Software Engineer", "Backend Engineer", "Data Engineer"],
    roundType: "coding",
    itemType: "coding",
    questionText: "Array Rotation: Given an array of integers and an integer `k`, rotate the array to the right by `k` steps. Print the rotated array elements separated by spaces.",
    starterCode: "import sys\n\ndef rotate_array(nums, k):\n    if not nums:\n        return \"\"\n    k = k % len(nums)\n    rotated = nums[-k:] + nums[:-k] if k > 0 else nums\n    return \" \".join(map(str, rotated))\n\nif __name__ == \"__main__\":\n    lines = sys.stdin.read().strip().split('\\n')\n    if len(lines) >= 2:\n        nums = [int(x) for x in lines[0].split()]\n        k = int(lines[1].strip())\n        print(rotate_array(nums, k))\n",
    testCases: [
      { input: "1 2 3 4 5 6 7\n3", expectedOutput: "5 6 7 1 2 3 4", description: "Standard rotation" },
      { input: "-1 -100 3 99\n2", expectedOutput: "3 99 -1 -100", description: "Negative numbers" },
      { input: "1 2\n3", expectedOutput: "2 1", description: "k > len(nums)" },
    ],
    idealAnswerPoints: ["Handles k > length with modulo", "O(N) time complexity", "In-place or slice reversal"],
  },
];

async function seed(force = false) {
  if (force) {
    await Question.deleteMany({});
    console.log(`[seed] Cleared all existing questions (--force)`);
  }

  const allQuestions = [
    ...behavioralQuestions.map((q) => ({ ...q, roundType: "hr", itemType: "open_ended" })),
    ...technicalQuestions.map((q) => ({ ...q, roundType: "technical", itemType: "open_ended" })),
    ...codingQuestions,
  ];

  let inserted = 0;
  for (const q of allQuestions) {
    const exists = await Question.findOne({ questionText: q.questionText });
    if (!exists) {
      await Question.create(q);
      inserted++;
    }
  }

  const total = await Question.countDocuments();
  const hrCount = await Question.countDocuments({ roundType: "hr" });
  const techCount = await Question.countDocuments({ roundType: "technical" });
  const codingCount = await Question.countDocuments({ roundType: "coding" });

  console.log(`[seed] Questions done. Inserted ${inserted} new questions. Total in DB: ${total}`);
  console.log(`[seed]   HR/Behavioral: ${hrCount}, Technical: ${techCount}, Coding: ${codingCount}`);
  return { inserted, total, hrCount, techCount, codingCount };
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`[seed] Connected to MongoDB`);

  const force = process.argv.includes("--force");
  await seed(force);

  await mongoose.disconnect();
  console.log(`[seed] Disconnected.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[seed] Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { seed, behavioralQuestions, technicalQuestions, codingQuestions };
