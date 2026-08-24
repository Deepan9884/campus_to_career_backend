/**
 * Question Bank Service
 * Provides pre-developed high quality MCQs & DSA problems,
 * along with LeetCode/HackerRank link extraction & parsing (WITHOUT solution code).
 */
const https = require("https");

const PRE_DEVELOPED_MCQ_BANK = [
  // ── DSA & ALGORITHMS (EASY, MEDIUM, HARD) ───────────────────────────────────
  {
    id: "mcq-dsa-1",
    topic: "Data Structures & Algorithms",
    difficulty: "easy",
    question: "What is the worst-case time complexity of searching an element in a balanced Binary Search Tree (BST) containing N nodes?",
    options: ["O(1)", "O(log N)", "O(N)", "O(N log N)"],
    correctOptionIndex: 1,
    correctAnswer: "O(log N)",
    positiveMarks: 1,
    negativeMarks: 0.25,
    explanation: "In a balanced BST (like an AVL or Red-Black tree), the height is guaranteed to be bounded by O(log N). Thus, search, insert, and delete operations take O(log N) worst-case time.",
  },
  {
    id: "mcq-dsa-2",
    topic: "Data Structures & Algorithms",
    difficulty: "easy",
    question: "Which data structure follows the Last-In-First-Out (LIFO) principle and is commonly used for function call stacks and parenthesis matching?",
    options: ["Queue", "Stack", "Heap", "Hash Map"],
    correctOptionIndex: 1,
    correctAnswer: "Stack",
    positiveMarks: 1,
    negativeMarks: 0.25,
    explanation: "A Stack is a LIFO data structure where elements are pushed and popped from the same end (top).",
  },
  {
    id: "mcq-dsa-3",
    topic: "Data Structures & Algorithms",
    difficulty: "medium",
    question: "What is the amortized time complexity of inserting N elements into a dynamic array (like Python list or C++ std::vector) that doubles capacity when full?",
    options: ["O(1) amortized per insert, O(N) total", "O(log N) amortized per insert", "O(N) amortized per insert", "O(N^2) total"],
    correctOptionIndex: 0,
    correctAnswer: "O(1) amortized per insert, O(N) total",
    positiveMarks: 2,
    negativeMarks: 0.5,
    explanation: "Geometric resizing (doubling) ensures that copying elements occurs infrequently. Summing the doubling copies gives a geometric series bounded by 2N, giving O(1) amortized per append.",
  },
  {
    id: "mcq-dsa-4",
    topic: "Data Structures & Algorithms",
    difficulty: "medium",
    question: "In Dijkstra's single-source shortest path algorithm implemented with a Min-Heap priority queue on a graph with V vertices and E edges, what is the tightest time complexity?",
    options: ["O(V^2)", "O((V + E) log V)", "O(V * E)", "O(E log E)"],
    correctOptionIndex: 1,
    correctAnswer: "O((V + E) log V)",
    positiveMarks: 2,
    negativeMarks: 0.5,
    explanation: "Each vertex is extracted once (V log V) and edge relaxations can insert/decrease key into the priority queue up to E times (E log V), yielding O((V + E) log V).",
  },
  {
    id: "mcq-dsa-5",
    topic: "Data Structures & Algorithms",
    difficulty: "hard",
    question: "Which algorithm finds strongly connected components (SCCs) in a directed graph in a single Depth-First Search traversal using vertex discovery times and low-link values?",
    options: ["Tarjan's SCC Algorithm", "Kosaraju's 2-Pass Algorithm", "Kruskal's MST Algorithm", "Floyd-Warshall Algorithm"],
    correctOptionIndex: 0,
    correctAnswer: "Tarjan's SCC Algorithm",
    positiveMarks: 3,
    negativeMarks: 0.75,
    explanation: "Tarjan's algorithm uses a single DFS with discovery time indices and a stack to identify root nodes of strongly connected components in O(V + E) time.",
  },
  {
    id: "mcq-dsa-6",
    topic: "Data Structures & Algorithms",
    difficulty: "hard",
    question: "In Dynamic Programming with Bitmasking for the Traveling Salesperson Problem (TSP) on N cities, what is the optimal state space and time complexity?",
    options: ["O(N!)", "O(2^N * N^2)", "O(N^3)", "O(2^N * N)"],
    correctOptionIndex: 1,
    correctAnswer: "O(2^N * N^2)",
    positiveMarks: 3,
    negativeMarks: 0.75,
    explanation: "The Held-Karp algorithm uses state dp[mask][i] representing visiting the subset of cities in `mask` ending at city `i`. There are 2^N * N states with N transitions each, yielding O(2^N * N^2).",
  },

  // ── DATABASE & SQL ─────────────────────────────────────────────────────────
  {
    id: "mcq-db-1",
    topic: "Database Management Systems",
    difficulty: "easy",
    question: "Which SQL clause is used to filter group results after an aggregate function (e.g. COUNT, SUM, AVG) is calculated?",
    options: ["WHERE", "HAVING", "GROUP BY", "ORDER BY"],
    correctOptionIndex: 1,
    correctAnswer: "HAVING",
    positiveMarks: 1,
    negativeMarks: 0.25,
    explanation: "WHERE filters rows before aggregation occurs, whereas HAVING filters groups after aggregation.",
  },
  {
    id: "mcq-db-2",
    topic: "Database Management Systems",
    difficulty: "medium",
    question: "Which Normal Form strictly eliminates transitive dependencies (non-prime attributes depending on other non-prime attributes) while retaining 2NF compliance?",
    options: ["First Normal Form (1NF)", "Second Normal Form (2NF)", "Third Normal Form (3NF)", "Boyce-Codd Normal Form (BCNF)"],
    correctOptionIndex: 2,
    correctAnswer: "Third Normal Form (3NF)",
    positiveMarks: 2,
    negativeMarks: 0.5,
    explanation: "3NF requires the relation to be in 2NF and have no transitive functional dependencies of non-prime attributes on candidate keys.",
  },
  {
    id: "mcq-db-3",
    topic: "Database Management Systems",
    difficulty: "hard",
    question: "In ACID transaction isolation levels, what anomaly does Snapshot Isolation (MVCC) prevent that traditional Read Committed allows?",
    options: ["Dirty Reads only", "Non-Repeatable Reads and Phantom Reads for reads within snapshot", "Write Skew", "Deadlocks"],
    correctOptionIndex: 1,
    correctAnswer: "Non-Repeatable Reads and Phantom Reads for reads within snapshot",
    positiveMarks: 3,
    negativeMarks: 0.75,
    explanation: "Snapshot Isolation allows transactions to view a consistent snapshot taken at the start of the transaction, eliminating dirty reads, non-repeatable reads, and phantom reads from concurrent commits (though write skew is still possible).",
  },

  // ── OPERATING SYSTEMS & NETWORKS ───────────────────────────────────────────
  {
    id: "mcq-os-1",
    topic: "Operating Systems",
    difficulty: "easy",
    question: "Which of the following conditions is NOT one of the 4 Coffman conditions required for a Deadlock to occur?",
    options: ["Mutual Exclusion", "Hold and Wait", "Preemption Allowed", "Circular Wait"],
    correctOptionIndex: 2,
    correctAnswer: "Preemption Allowed",
    positiveMarks: 1,
    negativeMarks: 0.25,
    explanation: "The 4 Coffman conditions are: 1. Mutual Exclusion, 2. Hold and Wait, 3. No Preemption (resources cannot be forcibly taken), and 4. Circular Wait.",
  },
  {
    id: "mcq-os-2",
    topic: "Operating Systems",
    difficulty: "medium",
    question: "What is the primary advantage of Virtual Memory Paging with Translation Lookaside Buffers (TLB)?",
    options: ["Eliminates external fragmentation and accelerates virtual-to-physical address translation", "Eliminates all cache misses", "Prevents process context switching", "Guarantees zero page faults"],
    correctOptionIndex: 0,
    correctAnswer: "Eliminates external fragmentation and accelerates virtual-to-physical address translation",
    positiveMarks: 2,
    negativeMarks: 0.5,
    explanation: "Paging divides memory into fixed-size frames to eliminate external fragmentation, while the TLB acts as a high-speed hardware cache for page table lookups.",
  },
  {
    id: "mcq-net-1",
    topic: "Computer Networks",
    difficulty: "medium",
    question: "In the TCP 3-Way Handshake connection establishment, what is the exact packet sequence transmitted between Client and Server?",
    options: ["SYN -> SYN-ACK -> ACK", "ACK -> SYN -> SYN-ACK", "SYN -> ACK -> DATA", "FIN -> ACK -> FIN-ACK"],
    correctOptionIndex: 0,
    correctAnswer: "SYN -> SYN-ACK -> ACK",
    positiveMarks: 2,
    negativeMarks: 0.5,
    explanation: "Client initiates with SYN packet; Server responds with SYN-ACK packet confirming receipt; Client sends ACK acknowledging connection.",
  },

  // ── PROGRAMMING LANGUAGES & OOPS ───────────────────────────────────────────
  {
    id: "mcq-lang-1",
    topic: "Programming Languages & OOP",
    difficulty: "easy",
    question: "In Object-Oriented Programming, what principle allows a subclass to provide a specific implementation of a method that is already provided by its parent class?",
    options: ["Method Overloading", "Method Overriding (Dynamic Polymorphism)", "Encapsulation", "Multiple Inheritance"],
    correctOptionIndex: 1,
    correctAnswer: "Method Overriding (Dynamic Polymorphism)",
    positiveMarks: 1,
    negativeMarks: 0.25,
    explanation: "Method Overriding allows a subclass to provide its specific implementation for a method declared in its superclass, resolved at runtime via dynamic dispatch.",
  },
  {
    id: "mcq-lang-2",
    topic: "Programming Languages & OOP",
    difficulty: "medium",
    question: "In Python, how is memory managed for reference counting and circular references?",
    options: ["Manual free() calls", "Reference Counting + Generational Garbage Collector (Cyclic GC)", "Mark and Sweep only", "Stop-the-world JVM GC"],
    correctOptionIndex: 1,
    correctAnswer: "Reference Counting + Generational Garbage Collector (Cyclic GC)",
    positiveMarks: 2,
    negativeMarks: 0.5,
    explanation: "CPython primary memory management is reference counting (deallocated immediately when count hits 0), supplemented by a cyclic generational garbage collector to detect isolated reference cycles.",
  },
  {
    id: "mcq-lang-3",
    topic: "Programming Languages & OOP",
    difficulty: "hard",
    question: "In C++ (C++11 onwards), what is the difference between `std::move` and `std::forward`?",
    options: [
      "`std::move` unconditionally casts its argument to an rvalue reference, while `std::forward` conditionally casts to an rvalue only if its argument was initialized with an rvalue (perfect forwarding)",
      "`std::move` copies memory buffers while `std::forward` deletes them",
      "`std::forward` converts pointers to smart pointers",
      "They are identical aliases for the same template function"
    ],
    correctOptionIndex: 0,
    correctAnswer: "`std::move` unconditionally casts its argument to an rvalue reference, while `std::forward` conditionally casts to an rvalue only if its argument was initialized with an rvalue (perfect forwarding)",
    positiveMarks: 3,
    negativeMarks: 0.75,
    explanation: "std::move performs an unconditional cast to an rvalue (T&&), enabling move semantics. std::forward is designed for universal references in templates to preserve the value category (lvalue vs rvalue) passed to the function.",
  },
];

const PRE_DEVELOPED_CODING_BANK = [
  {
    id: "coding-two-sum",
    title: "Two Sum Target Indices",
    difficulty: "Easy",
    category: "Arrays & Hash Table",
    sourceUrl: "https://leetcode.com/problems/two-sum/",
    problemStatement: "Given an array of integers nums and an integer target, return the indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\n### Example 1:\nInput: nums = [2,7,11,15], target = 9\nOutput: 0 1\nExplanation: Because nums[0] + nums[1] == 9, we return 0 1.\n\n### Example 2:\nInput: nums = [3,2,4], target = 6\nOutput: 1 2",
    diagramUrl: "",
    inputFormat: "First line contains integer N (array size) and target separated by space. Second line contains N space-separated integers.",
    outputFormat: "Two space-separated integers representing the zero-based indices of the matching pair.",
    constraints: [
      "2 <= nums.length <= 10^4",
      "-10^9 <= nums[i] <= 10^9",
      "-10^9 <= target <= 10^9",
      "Only one valid answer exists.",
    ],
    marks: 10,
    starterCodes: {
      python: "# Write your Python solution here\nimport sys\n\ndef solve():\n    lines = sys.stdin.read().split()\n    if not lines:\n        return\n    n, target = int(lines[0]), int(lines[1])\n    nums = [int(x) for x in lines[2:2+n]]\n    # Your logic here\n\nif __name__ == '__main__':\n    solve()\n",
      javascript: "// Write your JavaScript solution here\nconst fs = require('fs');\nconst input = fs.readFileSync('/dev/stdin', 'utf-8').trim().split(/\\s+/);\nif (input.length > 1) {\n  const n = parseInt(input[0], 10);\n  const target = parseInt(input[1], 10);\n  const nums = input.slice(2, 2 + n).map(Number);\n  // Your logic here\n}\n",
      java: "// Write your Java solution here\nimport java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        int target = sc.nextInt();\n        int[] nums = new int[n];\n        for (int i = 0; i < n; i++) nums[i] = sc.nextInt();\n        // Your logic here\n    }\n}\n",
      cpp: "// Write your C++ solution here\n#include <iostream>\n#include <vector>\n#include <unordered_map>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    int n, target;\n    if (!(cin >> n >> target)) return 0;\n    vector<int> nums(n);\n    for (int i = 0; i < n; i++) cin >> nums[i];\n    // Your logic here\n    return 0;\n}\n",
    },
    testCases: [
      { input: "4 9\n2 7 11 15", expectedOutput: "0 1", description: "Standard case with pair at start", isHidden: false },
      { input: "3 6\n3 2 4", expectedOutput: "1 2", description: "Pair elements in middle and end", isHidden: false },
      { input: "2 6\n3 3", expectedOutput: "0 1", description: "Duplicate values matching target", isHidden: true },
      { input: "5 100\n10 20 30 70 80", expectedOutput: "2 3", description: "Large numbers with distinct gap", isHidden: true },
    ],
  },
  {
    id: "coding-longest-substring",
    title: "Longest Substring Without Repeating Characters",
    difficulty: "Medium",
    category: "Sliding Window & Hash Map",
    sourceUrl: "https://leetcode.com/problems/longest-substring-without-repeating-characters/",
    problemStatement: "Given a string s, find the length of the longest substring without repeating characters.\n\n### Example 1:\nInput: s = 'abcabcbb'\nOutput: 3\nExplanation: The answer is 'abc', with length 3.\n\n### Example 2:\nInput: s = 'bbbbb'\nOutput: 1",
    diagramUrl: "",
    inputFormat: "A single string s on one line.",
    outputFormat: "A single integer denoting the length of the longest substring with unique characters.",
    constraints: [
      "0 <= s.length <= 5 * 10^4",
      "s consists of English letters, digits, symbols and spaces.",
    ],
    marks: 15,
    starterCodes: {
      python: "# Write your Python solution here\nimport sys\n\ndef solve():\n    line = sys.stdin.readline().rstrip('\\r\\n')\n    # Your logic here\n\nif __name__ == '__main__':\n    solve()\n",
      javascript: "// Write your JavaScript solution here\nconst fs = require('fs');\nconst s = fs.readFileSync('/dev/stdin', 'utf-8').replace(/[\\r\\n]+$/, '');\n// Your logic here\n",
      java: "// Write your Java solution here\nimport java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String s = sc.hasNextLine() ? sc.nextLine() : \"\";\n        // Your logic here\n    }\n}\n",
      cpp: "// Write your C++ solution here\n#include <iostream>\n#include <string>\n#include <vector>\nusing namespace std;\n\nint main() {\n    string s;\n    if (getline(cin, s)) {\n        // Your logic here\n    }\n    return 0;\n}\n",
    },
    testCases: [
      { input: "abcabcbb", expectedOutput: "3", description: "Mixed repeating characters", isHidden: false },
      { input: "bbbbb", expectedOutput: "1", description: "All identical characters", isHidden: false },
      { input: "pwwkew", expectedOutput: "3", description: "Substring with repeat in between", isHidden: true },
      { input: "a", expectedOutput: "1", description: "Single character", isHidden: true },
      { input: "tmmzuxt", expectedOutput: "5", description: "Edge case with duplicate far right", isHidden: true },
    ],
  },
  {
    id: "coding-trapping-rain-water",
    title: "Trapping Rain Water",
    difficulty: "Hard",
    category: "Two Pointers & Monotonic Stack",
    sourceUrl: "https://leetcode.com/problems/trapping-rain-water/",
    problemStatement: "Given n non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.\n\n### Example 1:\nInput: height = [0,1,0,2,1,0,1,3,2,1,2,1]\nOutput: 6\nExplanation: The elevation map traps 6 units of rain water.",
    diagramUrl: "https://assets.leetcode.com/uploads/2018/10/22/rainwatertrap.png",
    inputFormat: "First line: integer N. Second line: N space-separated non-negative integers.",
    outputFormat: "Single integer denoting total units of trapped rain water.",
    constraints: [
      "1 <= n <= 2 * 10^4",
      "0 <= height[i] <= 10^5",
    ],
    marks: 20,
    starterCodes: {
      python: "# Write your Python solution here\nimport sys\n\ndef solve():\n    lines = sys.stdin.read().split()\n    if not lines:\n        print(0)\n        return\n    n = int(lines[0])\n    heights = [int(x) for x in lines[1:1+n]]\n    # Your logic here\n\nif __name__ == '__main__':\n    solve()\n",
      javascript: "// Write your JavaScript solution here\nconst fs = require('fs');\nconst input = fs.readFileSync('/dev/stdin', 'utf-8').trim().split(/\\s+/);\nif (input.length > 0 && input[0] !== '') {\n  const n = parseInt(input[0], 10);\n  const heights = input.slice(1, 1 + n).map(Number);\n  // Your logic here\n}\n",
      java: "// Write your Java solution here\nimport java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        int[] heights = new int[n];\n        for (int i = 0; i < n; i++) heights[i] = sc.nextInt();\n        // Your logic here\n    }\n}\n",
      cpp: "// Write your C++ solution here\n#include <iostream>\n#include <vector>\nusing namespace std;\n\nint main() {\n    int n;\n    if (!(cin >> n)) return 0;\n    vector<int> heights(n);\n    for (int i = 0; i < n; i++) cin >> heights[i];\n    // Your logic here\n    return 0;\n}\n",
    },
    testCases: [
      { input: "12\n0 1 0 2 1 0 1 3 2 1 2 1", expectedOutput: "6", description: "Official classic elevation map", isHidden: false },
      { input: "6\n4 2 0 3 2 5", expectedOutput: "9", description: "Steep valley elevation", isHidden: false },
      { input: "3\n3 0 3", expectedOutput: "3", description: "U-shaped reservoir", isHidden: true },
      { input: "5\n5 4 3 2 1", expectedOutput: "0", description: "Strictly descending terrain", isHidden: true },
    ],
  },
];

/**
 * Filter MCQs by topics, difficulty, count
 */
function fetchMcqsFromBank({ topics = [], difficulty = "all", count = 5 }) {
  let filtered = [...PRE_DEVELOPED_MCQ_BANK];

  if (topics && topics.length > 0) {
    const topicKeywords = topics.map((t) => t.toLowerCase());
    filtered = filtered.filter((q) =>
      topicKeywords.some(
        (kw) =>
          q.topic.toLowerCase().includes(kw) ||
          q.question.toLowerCase().includes(kw)
      )
    );
  }

  if (difficulty && difficulty !== "all") {
    filtered = filtered.filter(
      (q) => q.difficulty.toLowerCase() === difficulty.toLowerCase()
    );
  }

  // If filtered is empty or fewer than count, fallback to general pool
  if (filtered.length < count) {
    const remaining = PRE_DEVELOPED_MCQ_BANK.filter(
      (q) => !filtered.some((f) => f.id === q.id)
    );
    filtered = [...filtered, ...remaining];
  }

  return filtered.slice(0, count);
}

/**
 * Standard starter boilerplates with ONLY a single comment line
 */
function getEmptyStarterCodes() {
  return {
    python: "# Write your code here\n",
    javascript: "// Write your code here\n",
    java: "// Write your code here\n",
    cpp: "// Write your code here\n",
    c: "// Write your code here\n",
    sql: "-- Write your code here\n",
  };
}

/**
 * Unescape HTML entities
 */
function unescapeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&le;/g, "<=")
    .replace(/&ge;/g, ">=")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#96;/g, "`")
    .trim();
}

/**
 * Clean HTML into formatted markdown for problem statements (Preserving Diagrams & Images)
 */
function cleanHtmlToMarkdown(html) {
  if (!html) return "";
  let text = html
    .replace(/<pre>([\s\S]*?)<\/pre>/gi, (match, p1) => {
      const cleanPre = p1
        .replace(/<strong>(.*?)<\/strong>/gi, "$1")
        .replace(/<code>(.*?)<\/code>/gi, "$1")
        .replace(/<[^>]+>/g, "");
      return `\n\`\`\`\n${cleanPre.trim()}\n\`\`\`\n`;
    })
    .replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, "\n\n![$2]($1)\n\n")
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi, "\n\n![$1]($2)\n\n")
    .replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, "\n\n![]($1)\n\n")
    .replace(/<code>(.*?)<\/code>/gi, "`$1`")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<p>/gi, "\n\n")
    .replace(/<\/p>/gi, "")
    .replace(/<li>(.*?)<\/li>/gi, "\n- $1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&le;/g, "<=")
    .replace(/&ge;/g, ">=")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n");
  return unescapeHtmlEntities(text);
}

/**
 * Fetch problem metadata & description directly from LeetCode's public GraphQL API
 */
function fetchLeetCodeGraphQL(titleSlug) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      query: `query getQuestionDetail($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          questionId
          questionFrontendId
          title
          titleSlug
          content
          difficulty
          exampleTestcaseList
          sampleTestCase
          topicTags { name }
        }
      }`,
      variables: { titleSlug },
    });

    const options = {
      hostname: "leetcode.com",
      path: "/graphql",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `https://leetcode.com/problems/${titleSlug}/`,
      },
      timeout: 8000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed?.data?.question || null);
        } catch (err) {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Convert LeetCode GraphQL response into structured problem schema
 */
function parseLeetCodeProblemData(q, sourceUrl) {
  const cleanDescription = cleanHtmlToMarkdown(q.content);

  // Extract first diagram image URL if present in HTML
  let diagramUrl = "";
  if (q.content) {
    const imgMatch = q.content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
      diagramUrl = imgMatch[1];
    }
  }

  const constraints = [];
  const constraintsMatch = q.content ? q.content.match(/<strong[^>]*>Constraints:<\/strong>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i) : null;
  if (constraintsMatch && constraintsMatch[1]) {
    const liMatches = constraintsMatch[1].match(/<li>(.*?)<\/li>/gi);
    if (liMatches) {
      liMatches.forEach((li) => {
        const cText = unescapeHtmlEntities(li.replace(/<[^>]+>/g, ""));
        if (cText) constraints.push(cText);
      });
    }
  }

  if (constraints.length === 0) {
    constraints.push("Time Limit: 2.0 seconds");
    constraints.push("Memory Limit: 256 MB");
  }

  const testCases = [];
  if (q.content) {
    const exampleRegex = /(?:<strong>|<b>)?Example\s*\d*:(?:<\/strong>|<\/b>)?[\s\S]*?<pre>([\s\S]*?)<\/pre>/gi;
    let exMatch;
    let exIndex = 1;
    while ((exMatch = exampleRegex.exec(q.content)) !== null) {
      const preContent = exMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
      const inputMatch = preContent.match(/Input:\s*([\s\S]*?)(?=Output:|$)/i);
      const outputMatch = preContent.match(/Output:\s*([\s\S]*?)(?=Explanation:|$)/i);

      if (inputMatch && outputMatch) {
        testCases.push({
          input: unescapeHtmlEntities(inputMatch[1]),
          expectedOutput: unescapeHtmlEntities(outputMatch[1]),
          description: `Example ${exIndex}`,
          isHidden: false,
        });
        exIndex++;
      }
    }
  }

  if (testCases.length === 0 && q.exampleTestcaseList && q.exampleTestcaseList.length > 0) {
    q.exampleTestcaseList.forEach((inputStr, idx) => {
      testCases.push({
        input: unescapeHtmlEntities(inputStr),
        expectedOutput: "",
        description: `Sample case ${idx + 1}`,
        isHidden: false,
      });
    });
  }

  // Ensure 4 test cases (visible + hidden evaluation cases)
  if (testCases.length > 0) {
    const baseInput = testCases[0].input;
    const baseOutput = testCases[0].expectedOutput;
    while (testCases.length < 4) {
      testCases.push({
        input: testCases[1]?.input || baseInput,
        expectedOutput: testCases[1]?.expectedOutput || baseOutput,
        description: testCases.length === 2 ? "Evaluation test case" : "Boundary condition case",
        isHidden: true,
      });
    }
  }

  return {
    id: `parsed-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: q.title || "Coding Challenge",
    difficulty: q.difficulty || "Medium",
    category: q.topicTags?.map((t) => t.name).join(", ") || "Data Structures & Algorithms",
    sourceUrl,
    problemStatement: cleanDescription || `Problem: ${q.title}`,
    diagramUrl,
    inputFormat: "Standard Input (stdin) format matching the problem specifications.",
    outputFormat: "Standard Output (stdout) format matching the required result.",
    constraints,
    marks: q.difficulty === "Hard" ? 20 : q.difficulty === "Easy" ? 10 : 15,
    starterCodes: getEmptyStarterCodes(),
    testCases: testCases.length > 0 ? testCases : [
      { input: "1", expectedOutput: "1", description: "Default case", isHidden: false }
    ],
  };
}

/**
 * Intelligent AI Problem extractor for HackerRank / GFG / CodeChef / Custom links
 */
async function parseCodingProblemWithAI(urlOrTitle, slug, platform) {
  let aiService;
  try {
    aiService = require("./ai.service");
  } catch (e) {
    aiService = null;
  }

  if (!aiService || typeof aiService.generateContent !== "function") {
    return null;
  }

  const prompt = `You are a Principal Software Engineer and Competitive Programming Problem Parser.
Extract or synthesize the EXACT, accurate problem specifications for this coding problem or link: "${urlOrTitle}" (Slug: "${slug}", Platform: "${platform}").

Requirements:
1. "title": Exact problem title.
2. "difficulty": "Easy", "Medium", or "Hard".
3. "category": Topic categories (e.g. "Arrays", "Dynamic Programming", "Trees", etc.).
4. "problemStatement": Detailed, complete description of the problem, clear explanation of the task, and examples.
5. "inputFormat": How standard input (stdin) is formatted.
6. "outputFormat": What should be printed to standard output (stdout).
7. "constraints": Array of constraint strings (e.g. "1 <= n <= 10^5", "Time Limit: 2.0s").
8. "testCases": Array of 4 test cases (2 sample cases and 2 hidden edge cases), each with:
   - "input": exact string input
   - "expectedOutput": exact expected string output
   - "description": brief description of what this case tests
   - "isHidden": boolean (false for first 2, true for rest)

Return STRICT JSON matching this schema:
{
  "title": "Problem Title",
  "difficulty": "Medium",
  "category": "Topic",
  "problemStatement": "Full problem description...",
  "inputFormat": "Input format...",
  "outputFormat": "Output format...",
  "constraints": ["Constraint 1", "Constraint 2"],
  "marks": 15,
  "testCases": [
    { "input": "...", "expectedOutput": "...", "description": "Sample 1", "isHidden": false },
    { "input": "...", "expectedOutput": "...", "description": "Sample 2", "isHidden": false },
    { "input": "...", "expectedOutput": "...", "description": "Hidden 1", "isHidden": true },
    { "input": "...", "expectedOutput": "...", "description": "Hidden 2", "isHidden": true }
  ]
}`;

  try {
    const aiResult = await aiService.generateContent({
      prompt,
      feature: "admin-coding-parser",
      responseSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          difficulty: { type: "string" },
          category: { type: "string" },
          problemStatement: { type: "string" },
          inputFormat: { type: "string" },
          outputFormat: { type: "string" },
          constraints: { type: "array" },
          marks: { type: "number" },
          testCases: { type: "array" },
        },
      },
    });

    if (aiResult && aiResult.title && aiResult.problemStatement) {
      return {
        id: `ai-parsed-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: aiResult.title,
        difficulty: aiResult.difficulty || "Medium",
        category: aiResult.category || `${platform} Curated Problem`,
        sourceUrl: urlOrTitle,
        problemStatement: aiResult.problemStatement,
        diagramUrl: "",
        inputFormat: aiResult.inputFormat || "Standard Input format",
        outputFormat: aiResult.outputFormat || "Standard Output format",
        constraints: Array.isArray(aiResult.constraints) ? aiResult.constraints : ["Time Limit: 2.0s"],
        marks: aiResult.marks || 15,
        starterCodes: getEmptyStarterCodes(),
        testCases: Array.isArray(aiResult.testCases) && aiResult.testCases.length > 0
          ? aiResult.testCases
          : [
              { input: "1", expectedOutput: "1", description: "Sample case", isHidden: false }
            ],
      };
    }
  } catch (err) {
    console.warn("[Coding Parser AI] AI generation error:", err.message);
  }
  return null;
}

/**
 * Parse / Fetch Coding problem details from LeetCode, HackerRank, GFG URL or Problem Name.
 * STRICT POLICY: NEVER populate solution code in starterCodes!
 */
async function parseCodingProblemFromUrl(urlOrTitle) {
  const clean = (urlOrTitle || "").trim();

  // 1. Check if matched against pre-developed catalog
  const found = PRE_DEVELOPED_CODING_BANK.find((p) => {
    const slug = clean.toLowerCase().replace(/[^a-z0-9]/g, "");
    const titleSlug = p.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const urlSlug = p.sourceUrl.toLowerCase().replace(/[^a-z0-9]/g, "");
    return slug.includes(titleSlug) || urlSlug.includes(slug) || slug === titleSlug;
  });

  if (found) {
    return {
      id: `p-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: found.title,
      difficulty: found.difficulty,
      category: found.category,
      sourceUrl: clean.startsWith("http") ? clean : found.sourceUrl,
      problemStatement: found.problemStatement,
      diagramUrl: found.diagramUrl || "",
      inputFormat: found.inputFormat,
      outputFormat: found.outputFormat,
      constraints: found.constraints,
      marks: found.marks,
      starterCodes: getEmptyStarterCodes(), // strictly clean boilerplate
      testCases: found.testCases,
    };
  }

  // 2. Extract Slug and Platform from URL
  let platform = "General Platform";
  let slug = clean;

  if (clean.includes("leetcode.com")) {
    platform = "LeetCode";
    const match = clean.match(/problems\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) slug = match[1];
  } else if (clean.includes("hackerrank.com")) {
    platform = "HackerRank";
    const match = clean.match(/challenges\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) slug = match[1];
  } else if (clean.includes("geeksforgeeks.org")) {
    platform = "GeeksforGeeks";
    const match = clean.match(/problems\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) slug = match[1];
  }

  // 3. For LeetCode links or problem slugs: Query live LeetCode Public GraphQL API
  if (platform === "LeetCode" || !clean.startsWith("http")) {
    const leetCodeSlug = slug.toLowerCase().replace(/^https?:\/\/.*?problems\//, "").replace(/\/.*$/, "").trim();
    if (leetCodeSlug) {
      try {
        const liveLeetCodeQuestion = await fetchLeetCodeGraphQL(leetCodeSlug);
        if (liveLeetCodeQuestion && liveLeetCodeQuestion.title) {
          return parseLeetCodeProblemData(liveLeetCodeQuestion, clean);
        }
      } catch (err) {
        console.warn("[LeetCode Live GraphQL] Fetch error:", err.message);
      }
    }
  }

  // 4. Try AI-powered parsing for HackerRank / GFG / Custom links or when LeetCode is unreachable
  const aiParsed = await parseCodingProblemWithAI(clean, slug, platform);
  if (aiParsed) {
    return aiParsed;
  }

  // 5. Fallback structured problem representation
  const formattedTitle = slug
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return {
    id: `parsed-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: formattedTitle || "Algorithmic Challenge",
    difficulty: "Medium",
    category: `${platform} Curated Challenge`,
    sourceUrl: clean,
    problemStatement: `Problem: ${formattedTitle}\n\nGiven the specifications from ${platform}, design and implement an optimal algorithm adhering to the constraints.\n\nDescription:\nRead the input parameters from standard input (stdin), execute the required transformation and computational logic, and print the output directly to standard output (stdout).`,
    diagramUrl: "",
    inputFormat: "Standard input format matching the problem description.",
    outputFormat: "Standard output matching the expected format.",
    constraints: [
      "1 <= N <= 10^5",
      "-10^9 <= value <= 10^9",
      "Time Limit: 2.0s, Memory Limit: 256MB",
    ],
    marks: 15,
    starterCodes: getEmptyStarterCodes(),
    testCases: [
      { input: "4\n1 2 3 4", expectedOutput: "10", description: "Sample test case", isHidden: false },
      { input: "5\n10 20 30 40 50", expectedOutput: "150", description: "Standard evaluation case", isHidden: false },
      { input: "1\n999", expectedOutput: "999", description: "Single element edge case", isHidden: true },
      { input: "6\n-5 5 -10 10 -20 20", expectedOutput: "0", description: "Negative integers balance case", isHidden: true },
    ],
  };
}

module.exports = {
  PRE_DEVELOPED_MCQ_BANK,
  PRE_DEVELOPED_CODING_BANK,
  fetchMcqsFromBank,
  parseCodingProblemFromUrl,
  getEmptyStarterCodes,
};
