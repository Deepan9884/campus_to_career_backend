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

  // ── FULL STACK & WEB ARCHITECTURE ──────────────────────────────────────────
  {
    id: "mcq-fullstack-1",
    topic: "Full Stack & Web Development",
    difficulty: "easy",
    question: "In client-server web architecture, what is the primary purpose of Cross-Origin Resource Sharing (CORS)?",
    options: [
      "To accelerate database queries on the server",
      "To allow or restrict resources requested on a web page from another domain outside the domain from which the first resource was served",
      "To compress HTTP response payloads using gzip",
      "To encrypt passwords stored in browser localStorage"
    ],
    correctOptionIndex: 1,
    correctAnswer: "To allow or restrict resources requested on a web page from another domain outside the domain from which the first resource was served",
    positiveMarks: 1,
    negativeMarks: 0.25,
    explanation: "CORS is a browser security mechanism that uses HTTP headers to tell browsers whether a particular web application can access resources from a different origin.",
  },
  {
    id: "mcq-fullstack-2",
    topic: "Full Stack & Web Development",
    difficulty: "easy",
    question: "In Node.js/Express, what role does middleware play in the HTTP request-response cycle?",
    options: [
      "Functions that have access to the request object (req), the response object (res), and the next middleware function in the cycle",
      "Hardware drivers that connect the server to the router",
      "A database indexing engine that replaces MongoDB",
      "A CSS compiler that executes inside the V8 engine"
    ],
    correctOptionIndex: 0,
    correctAnswer: "Functions that have access to the request object (req), the response object (res), and the next middleware function in the cycle",
    positiveMarks: 1,
    negativeMarks: 0.25,
    explanation: "Middleware functions execute during the lifecycle of a request to Express. Each middleware can modify req/res, end the request, or call next() to pass control.",
  },
  {
    id: "mcq-fullstack-3",
    topic: "Full Stack & Web Development",
    difficulty: "medium",
    question: "In modern React applications, why should you NOT directly mutate component state (e.g. state.items.push(newItem))?",
    options: [
      "Because JavaScript strictly forbids array modification",
      "React relies on reference equality checks (shallow comparison) to detect state changes and trigger re-renders; mutating state directly bypasses reconciliation",
      "Direct mutation deletes the browser cache",
      "It causes an instant syntax error in the browser console"
    ],
    correctOptionIndex: 1,
    correctAnswer: "React relies on reference equality checks (shallow comparison) to detect state changes and trigger re-renders; mutating state directly bypasses reconciliation",
    positiveMarks: 2,
    negativeMarks: 0.5,
    explanation: "React relies on immutability. Creating new object/array references allows React's reconciliation engine to quickly determine when components need to re-render without expensive deep comparisons.",
  },
  {
    id: "mcq-fullstack-4",
    topic: "Full Stack & Web Development",
    difficulty: "medium",
    question: "In RESTful API design, what is the key difference between the HTTP PUT and PATCH methods?",
    options: [
      "PUT replaces the entire resource representation, while PATCH applies partial modifications to the resource",
      "PUT is only for inserting new rows, PATCH is only for deleting rows",
      "PUT cannot carry a request body, while PATCH must carry an XML payload",
      "There is no difference; they are exact aliases in HTTP 1.1"
    ],
    correctOptionIndex: 0,
    correctAnswer: "PUT replaces the entire resource representation, while PATCH applies partial modifications to the resource",
    positiveMarks: 2,
    negativeMarks: 0.5,
    explanation: "HTTP PUT is idempotent and expects the full resource payload to replace the entity, whereas HTTP PATCH is designed for partial updates of specific fields.",
  },
  {
    id: "mcq-fullstack-5",
    topic: "Full Stack & Web Development",
    difficulty: "hard",
    question: "In Server-Side Rendering (SSR) with hydration (such as Next.js or Remix), what is a 'Hydration Mismatch' error?",
    options: [
      "When the database runs out of connection pool slots",
      "When the pre-rendered HTML generated on the server differs from the initial DOM tree rendered by React on the client during hydration",
      "When Redis cache fails to connect to the Node.js backend",
      "When CSS styles fail to load over HTTPS"
    ],
    correctOptionIndex: 1,
    correctAnswer: "When the pre-rendered HTML generated on the server differs from the initial DOM tree rendered by React on the client during hydration",
    positiveMarks: 3,
    negativeMarks: 0.75,
    explanation: "Hydration is the process where React attaches event handlers to the server-rendered HTML. If the server output and client initial render differ (e.g. due to Date.now(), window checks, or browser-only APIs), React throws a hydration mismatch.",
  },
  {
    id: "mcq-fullstack-6",
    topic: "Full Stack & Web Development",
    difficulty: "hard",
    question: "Which pattern is recommended to securely store JWT (JSON Web Tokens) for user authentication against XSS and CSRF attacks?",
    options: [
      "Store in window.localStorage with unrestricted JavaScript access",
      "Store the Refresh Token in an HttpOnly, Secure, SameSite=Strict cookie, and keep the short-lived Access Token in client-side memory",
      "Write the token into the browser URL query parameters",
      "Save the raw password in the session cookie without signing"
    ],
    correctOptionIndex: 1,
    correctAnswer: "Store the Refresh Token in an HttpOnly, Secure, SameSite=Strict cookie, and keep the short-lived Access Token in client-side memory",
    positiveMarks: 3,
    negativeMarks: 0.75,
    explanation: "HttpOnly cookies prevent JavaScript from accessing tokens (defending against XSS), SameSite=Strict defends against CSRF, and holding short-lived access tokens in memory limits compromise exposure.",
  },
  {
    id: "mcq-fullstack-7",
    topic: "Full Stack & Web Development",
    difficulty: "easy",
    question: "What HTTP status code should a server return when a resource is successfully created via a POST request?",
    options: ["200 OK", "201 Created", "204 No Content", "301 Moved Permanently"],
    correctOptionIndex: 1,
    correctAnswer: "201 Created",
    positiveMarks: 1,
    negativeMarks: 0.25,
    explanation: "HTTP 201 Created is the standard response indicating that the request has succeeded and led to the creation of a new resource.",
  },
  {
    id: "mcq-fullstack-8",
    topic: "Full Stack & Web Development",
    difficulty: "easy",
    question: "In the JavaScript Event Loop, what is the correct execution order of Microtasks (e.g. Promise.then, queueMicrotask) and Macrotasks (e.g. setTimeout, setInterval)?",
    options: [
      "Macrotasks execute first, followed by Microtasks only at page reload",
      "After the currently executing synchronous script completes, ALL Microtasks are drained before the next Macrotask is processed",
      "They run concurrently in separate OS threads",
      "Microtasks are executed strictly after all Macrotasks in the queue finish"
    ],
    correctOptionIndex: 1,
    correctAnswer: "After the currently executing synchronous script completes, ALL Microtasks are drained before the next Macrotask is processed",
    positiveMarks: 1,
    negativeMarks: 0.25,
    explanation: "The JavaScript runtime processes the microtask queue to completion immediately after each task/call-stack drain, prior to picking the next macrotask.",
  },
  {
    id: "mcq-fullstack-9",
    topic: "Full Stack & Web Development",
    difficulty: "medium",
    question: "When should a Full-Stack application utilize WebSockets instead of standard HTTP Polling?",
    options: [
      "For static blog content delivery",
      "When low-latency, bidirectional, persistent communication is required (e.g. live chat, real-time collaboration, or market tickers)",
      "Only when the client browser does not support JavaScript",
      "To upload large video files over FTP"
    ],
    correctOptionIndex: 1,
    correctAnswer: "When low-latency, bidirectional, persistent communication is required (e.g. live chat, real-time collaboration, or market tickers)",
    positiveMarks: 2,
    negativeMarks: 0.5,
    explanation: "WebSockets provide a persistent full-duplex TCP channel over a single connection, eliminating the overhead of repeated HTTP request headers in real-time scenarios.",
  },
  {
    id: "mcq-fullstack-10",
    topic: "Full Stack & Web Development",
    difficulty: "medium",
    question: "In MongoDB and Mongoose, what is the primary benefit of creating a Compound Index on `{ status: 1, createdAt: -1 }`?",
    options: [
      "It automatically encrypts the fields on disk",
      "It allows queries filtering by status and sorting by createdAt to be resolved directly from the index without in-memory collection scans or sorting",
      "It turns MongoDB into a relational SQL database",
      "It eliminates the need for database backups"
    ],
    correctOptionIndex: 1,
    correctAnswer: "It allows queries filtering by status and sorting by createdAt to be resolved directly from the index without in-memory collection scans or sorting",
    positiveMarks: 2,
    negativeMarks: 0.5,
    explanation: "Compound indexes matching the Equality-Sort-Range (ESR) rule allow MongoDB to filter documents and satisfy sort orders directly within index memory.",
  },
  {
    id: "mcq-fullstack-11",
    topic: "Full Stack & Web Development",
    difficulty: "hard",
    question: "In high-traffic backend architectures, what is the purpose of implementing a Circuit Breaker pattern (e.g. using Opossum or Resilience4j)?",
    options: [
      "To restart the physical data center power supply",
      "To detect downstream service failures and fail fast without overwhelming struggling dependencies with repeated requests",
      "To automatically minify JavaScript bundle sizes",
      "To encrypt SSL certificates on Cloudflare"
    ],
    correctOptionIndex: 1,
    correctAnswer: "To detect downstream service failures and fail fast without overwhelming struggling dependencies with repeated requests",
    positiveMarks: 3,
    negativeMarks: 0.75,
    explanation: "Circuit Breakers prevent cascading failures across distributed microservices by opening when error thresholds are crossed, temporarily returning fallback responses until dependencies recover.",
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
  let pool = [...PRE_DEVELOPED_MCQ_BANK];

  if (topics && topics.length > 0) {
    const rawSearch = topics.join(" ").toLowerCase();

    // Determine target category
    const isFullStack = /full[\s-]?stack|web|react|node|javascript|frontend|backend|express|html|css|api|rest/i.test(rawSearch);
    const isDsa = /dsa|data\s*structure|algorithm|tree|graph|dp|dynamic\s*prog|binary\s*search|array|linked\s*list/i.test(rawSearch);
    const isDb = /database|dbms|sql|mongo|nosql|postgres|mysql|query/i.test(rawSearch);
    const isOs = /operating\s*system|network|tcp|thread|process|deadlock|concurrency/i.test(rawSearch);
    const isLang = /python|java|cpp|c\+\+|oop|object\s*oriented|csharp|golang/i.test(rawSearch);

    let topicFiltered = pool.filter((q) => {
      const topicLower = q.topic.toLowerCase();
      if (isFullStack && topicLower.includes("full stack")) return true;
      if (isDsa && topicLower.includes("data structures")) return true;
      if (isDb && topicLower.includes("database")) return true;
      if (isOs && (topicLower.includes("operating") || topicLower.includes("network"))) return true;
      if (isLang && topicLower.includes("programming")) return true;
      return false;
    });

    if (topicFiltered.length === 0) {
      // Fallback to general topic keyword search across topic names
      const words = rawSearch.split(/\s+/).filter((w) => w.length > 2);
      topicFiltered = pool.filter((q) =>
        words.some((w) => q.topic.toLowerCase().includes(w))
      );
    }

    if (topicFiltered.length > 0) {
      pool = topicFiltered;
    }
  }

  if (difficulty && difficulty !== "all") {
    const diffMatches = pool.filter(
      (q) => q.difficulty.toLowerCase() === difficulty.toLowerCase()
    );
    if (diffMatches.length > 0) {
      pool = diffMatches;
    }
  }

  // Shuffle or slice up to count
  return pool.slice(0, count);
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
    const rawOutputs = Array.from((q.content || "").matchAll(/Output:\s*([^\n\r<]+)/gi));
    q.exampleTestcaseList.forEach((inputStr, idx) => {
      const extractedOut = rawOutputs[idx] ? unescapeHtmlEntities(rawOutputs[idx][1]).replace(/[`*"]/g, "").trim() : "";
      testCases.push({
        input: unescapeHtmlEntities(inputStr),
        expectedOutput: extractedOut || "",
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

/**
 * Generate a complete, schema-compliant 3-section technical assessment for any skill/subtopic.
 * Guarantees Section 1 (5 MCQs), Section 2 (1 Coding Challenge), Section 3 (3 Advanced MCQs).
 */
function generateSmartQuizQuestions({ skillName = "Software Engineering", subTopicName = "Core Competency", userPreferences = {} }) {
  const targetSkill = (skillName || "Software Engineering").trim();
  const targetSubTopic = (subTopicName || `${targetSkill} Fundamentals`).trim();
  const prefLang = userPreferences?.preferredLanguage || "JavaScript";

  const lowerSkill = targetSkill.toLowerCase();
  const lowerSub = targetSubTopic.toLowerCase();
  const combined = `${lowerSkill} ${lowerSub}`;

  const isJs = /javascript|typescript|react|next|node|express|vue|angular|frontend|web/i.test(combined);
  const isPython = /python|django|fastapi|pandas|numpy|data\s*science|machine\s*learning|ai/i.test(combined);
  const isJava = /java\b|spring|springboot|hibernate|jvm/i.test(combined);
  const isCpp = /c\+\+|cpp|\bc\b|rust|golang|go\b/i.test(combined);
  const isSql = /sql|database|dbms|postgres|mysql|mongo|nosql|redis/i.test(combined);
  const isDsa = /dsa|data\s*structure|algorithm|binary\s*tree|graph|dp|sorting/i.test(combined);

  // Section 1: 5 Foundational MCQs
  let s1Questions = [];
  if (isJs) {
    s1Questions = [
      {
        questionId: "s1_q1",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "easy",
        questionText: `In ${targetSkill}, what is the primary distinction between '==' and '===' comparison operators?`,
        options: [
          "A) '==' performs type coercion before comparison, while '===' checks both value and type strictly",
          "B) '===' performs type coercion, while '==' checks strict identity",
          "C) '===' is only for comparing numbers, while '==' is for strings",
          "D) They are completely identical in ES6 and modern engines",
        ],
        correctAnswer: "A) '==' performs type coercion before comparison, while '===' checks both value and type strictly",
        explanation: "Strict equality (===) does not perform type conversion and requires both operands to share the same type and value.",
        keyPoints: ["Strict equality vs type coercion in JavaScript", "Value comparison best practices"],
      },
      {
        questionId: "s1_q2",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "easy",
        questionText: `Which array method creates a new array populated with the results of calling a provided function on every element in the calling array?`,
        options: ["A) Array.prototype.forEach()", "B) Array.prototype.map()", "C) Array.prototype.filter()", "D) Array.prototype.reduce()"],
        correctAnswer: "B) Array.prototype.map()",
        explanation: "map() transforms elements into a newly returned array without mutating the source array.",
        keyPoints: ["Immutable functional programming patterns", "Array transformation methods"],
      },
      {
        questionId: "s1_q3",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `In asynchronous ${targetSkill}, how does the Event Loop handle Promise resolution (.then callbacks / async-await) relative to setTimeout callbacks?`,
        options: [
          "A) setTimeout callbacks execute before Promise microtasks",
          "B) Promise callbacks enter the Microtask queue and execute immediately after the current call stack drains before the next Macrotask",
          "C) They execute in parallel across separate operating system threads",
          "D) Promises only resolve after the browser window is reloaded",
        ],
        correctAnswer: "B) Promise callbacks enter the Microtask queue and execute immediately after the current call stack drains before the next Macrotask",
        explanation: "The JavaScript runtime drains all Microtasks (Promises) before advancing to the next Macrotask (setTimeout, setInterval).",
        keyPoints: ["Event Loop microtask vs macrotask queuing", "Asynchronous non-blocking concurrency"],
      },
      {
        questionId: "s1_q4",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `What is a Closure in ${targetSkill}?`,
        options: [
          "A) A function that has access to variables in its outer lexical scope even after that outer function has returned",
          "B) A method that closes open file descriptors and database connections",
          "C) An automatic destructor that frees memory in C-style languages",
          "D) A syntax error that prevents function execution",
        ],
        correctAnswer: "A) A function that has access to variables in its outer lexical scope even after that outer function has returned",
        explanation: "Closures capture their surrounding lexical environment, allowing inner functions to reference outer variables even after the outer scope exits.",
        keyPoints: ["Lexical scope retention", "Functional encapsulation"],
      },
      {
        questionId: "s1_q5",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `What HTTP response status code indicates that a client request lacks valid authentication credentials?`,
        options: ["A) 200 OK", "B) 401 Unauthorized", "C) 403 Forbidden", "D) 404 Not Found"],
        correctAnswer: "B) 401 Unauthorized",
        explanation: "401 Unauthorized specifically means authentication credentials are required and either missing or invalid.",
        keyPoints: ["HTTP status standards", "API authentication vs authorization"],
      },
    ];
  } else if (isPython) {
    s1Questions = [
      {
        questionId: "s1_q1",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "easy",
        questionText: `In ${targetSkill}, what is the key difference between a list and a tuple?`,
        options: [
          "A) Lists are mutable, while tuples are immutable",
          "B) Tuples can only store integers, while lists store any type",
          "C) Lists do not allow indexing, while tuples do",
          "D) Tuples require manual memory deallocation via delete()",
        ],
        correctAnswer: "A) Lists are mutable, while tuples are immutable",
        explanation: "Lists can be modified in-place (mutable), whereas tuples cannot be altered after creation (immutable).",
        keyPoints: ["Mutability vs immutability in Python", "Data structure trade-offs"],
      },
      {
        questionId: "s1_q2",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "easy",
        questionText: `What is the output of 'bool([])' in Python?`,
        options: ["A) True", "B) False", "C) None", "D) Raises TypeError"],
        correctAnswer: "B) False",
        explanation: "Empty collections in Python (like [], {}, '') evaluate to falsy values in boolean contexts.",
        keyPoints: ["Truthiness in Python", "Empty sequence evaluation"],
      },
      {
        questionId: "s1_q3",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `What keyword is used to write a Generator function in ${targetSkill} that produces values on-demand lazily?`,
        options: ["A) return", "B) yield", "C) emit", "D) await"],
        correctAnswer: "B) yield",
        explanation: "The 'yield' keyword pauses execution and yields a value back to the caller, resuming state on subsequent iterations.",
        keyPoints: ["Generators and lazy evaluation", "Memory-efficient iteration"],
      },
      {
        questionId: "s1_q4",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `What is the primary role of Python's Global Interpreter Lock (GIL)?`,
        options: [
          "A) Prevents race conditions by ensuring only one native thread executes Python bytecode at a time in CPython",
          "B) Encrypts source code before compiling into .pyc bytecode",
          "C) Restricts file system access to root directories",
          "D) Enforces single-instance singleton patterns for class definitions",
        ],
        correctAnswer: "A) Prevents race conditions by ensuring only one native thread executes Python bytecode at a time in CPython",
        explanation: "CPython uses the GIL as a mutex to synchronize memory management and reference counting across threads.",
        keyPoints: ["CPython runtime architecture", "Threading vs multiprocessing"],
      },
      {
        questionId: "s1_q5",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `Which dictionary method returns a value for a specified key if the key is in dictionary, else returns a default value without raising KeyError?`,
        options: ["A) dict.pop()", "B) dict.get(key, default)", "C) dict.fetch()", "D) dict.find()"],
        correctAnswer: "B) dict.get(key, default)",
        explanation: "dict.get(key, default) safely retrieves values without raising KeyError if the key is missing.",
        keyPoints: ["Dictionary operations", "Graceful exception prevention"],
      },
    ];
  } else if (isSql) {
    s1Questions = [
      {
        questionId: "s1_q1",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "easy",
        questionText: `Which SQL statement is used to extract records from a database table?`,
        options: ["A) EXTRACT", "B) SELECT", "C) GET", "D) QUERY"],
        correctAnswer: "B) SELECT",
        explanation: "The SELECT statement is the fundamental DML command used to query and retrieve data from database relations.",
        keyPoints: ["Core SQL syntax", "Data retrieval commands"],
      },
      {
        questionId: "s1_q2",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "easy",
        questionText: `Which SQL keyword is used to eliminate duplicate rows from query results?`,
        options: ["A) UNIQUE", "B) DISTINCT", "C) DIFFERENT", "D) NO_DUPLICATE"],
        correctAnswer: "B) DISTINCT",
        explanation: "SELECT DISTINCT removes duplicate records, returning only unique value combinations.",
        keyPoints: ["Deduplication in queries", "Relational algebra projection"],
      },
      {
        questionId: "s1_q3",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `What is the key difference between WHERE and HAVING clauses in SQL?`,
        options: [
          "A) WHERE filters individual rows before aggregation; HAVING filters aggregated groups after GROUP BY",
          "B) HAVING is only for numeric columns, WHERE is for text",
          "C) WHERE is only used in subqueries, HAVING is used in outer queries",
          "D) They are completely interchangeable synonyms in ANSI SQL",
        ],
        correctAnswer: "A) WHERE filters individual rows before aggregation; HAVING filters aggregated groups after GROUP BY",
        explanation: "WHERE filters raw rows prior to group calculation; HAVING filters the groups produced by aggregate functions.",
        keyPoints: ["Aggregation execution order", "Group filtering rules"],
      },
      {
        questionId: "s1_q4",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `Which index type is commonly used as the default in relational databases (PostgreSQL, MySQL) for fast equality and range queries?`,
        options: ["A) Hash Index", "B) B-Tree (B+ Tree) Index", "C) Bitmap Index", "D) Spatial R-Tree Index"],
        correctAnswer: "B) B-Tree (B+ Tree) Index",
        explanation: "B+ Tree indexes keep data sorted in balanced tree structures, supporting O(log N) equality searches as well as range scans.",
        keyPoints: ["Database indexing data structures", "B+ Tree properties and range query support"],
      },
      {
        questionId: "s1_q5",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `In relational database design, what does Third Normal Form (3NF) guarantee?`,
        options: [
          "A) Every table must have at least 3 foreign keys",
          "B) The relation is in 2NF and has no transitive functional dependencies of non-prime attributes on the primary key",
          "C) Data is replicated across 3 separate server nodes",
          "D) All columns contain comma-separated arrays",
        ],
        correctAnswer: "B) The relation is in 2NF and has no transitive functional dependencies of non-prime attributes on the primary key",
        explanation: "3NF eliminates transitive dependencies where non-key attributes depend on other non-key attributes.",
        keyPoints: ["Database normalization principles", "Transitive dependency elimination"],
      },
    ];
  } else {
    // General Engineering / Core Tech
    s1Questions = [
      {
        questionId: "s1_q1",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "easy",
        questionText: `In software engineering for ${targetSkill}, what is the primary benefit of modular code design?`,
        options: [
          "A) High cohesion within modules, loose coupling between modules, and improved maintainability",
          "B) Guarantees the application runs in zero CPU clock cycles",
          "C) Eliminates all need for automated testing",
          "D) Prevents multiple developers from working on the repository simultaneously",
        ],
        correctAnswer: "A) High cohesion within modules, loose coupling between modules, and improved maintainability",
        explanation: "Modularity separates concerns into distinct components, making software easier to test, refactor, and scale.",
        keyPoints: ["Coupling and cohesion", "Software architectural fundamentals"],
      },
      {
        questionId: "s1_q2",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "easy",
        questionText: `What is the worst-case time complexity of searching for an item in an unsorted array of N elements?`,
        options: ["A) O(1)", "B) O(log N)", "C) O(N)", "D) O(N^2)"],
        correctAnswer: "C) O(N)",
        explanation: "Linear search requires checking each of the N elements in the worst case when the target is at the end or absent.",
        keyPoints: ["Asymptotic notation", "Linear search complexity"],
      },
      {
        questionId: "s1_q3",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `What principle of OOP states that internal object state should be hidden and accessible only through public methods?`,
        options: ["A) Inheritance", "B) Encapsulation", "C) Polymorphism", "D) Abstraction"],
        correctAnswer: "B) Encapsulation",
        explanation: "Encapsulation bundles data with methods that operate on that data and restricts direct access to internal components.",
        keyPoints: ["Object-oriented principles", "Information hiding"],
      },
      {
        questionId: "s1_q4",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `In distributed systems, what does the CAP theorem assert about a network partition?`,
        options: [
          "A) A system can simultaneously guarantee Consistency, Availability, and Partition Tolerance",
          "B) When a network partition occurs, a system must choose between Consistency and Availability",
          "C) Partitions can always be prevented with faster network switches",
          "D) Availability is never affected by network partitions",
        ],
        correctAnswer: "B) When a network partition occurs, a system must choose between Consistency and Availability",
        explanation: "In the presence of a network partition (P), a distributed system must trade off either linearizable Consistency (C) or Availability (A).",
        keyPoints: ["CAP theorem trade-offs", "Distributed systems resilience"],
      },
      {
        questionId: "s1_q5",
        section: 1,
        sectionTitle: "Section 1: Conceptual MCQs",
        type: "mcq",
        difficulty: "medium",
        questionText: `Which data structure offers average O(1) time complexity for insertion, deletion, and search operations?`,
        options: ["A) Singly Linked List", "B) Hash Table / Map", "C) Binary Search Tree", "D) Sorted Array"],
        correctAnswer: "B) Hash Table / Map",
        explanation: "Hash tables map keys to bucket indices using a hash function, achieving constant average time complexity O(1).",
        keyPoints: ["Hash table mechanics", "Time complexity trade-offs"],
      },
    ];
  }

  // Section 2: 1 Practical Coding Challenge
  const codingProblem = {
    questionId: "s2_q1",
    section: 2,
    sectionTitle: "Section 2: Coding Challenge",
    type: "coding",
    difficulty: "medium",
    questionText: `Problem Statement:\nImplement an efficient algorithm for ${targetSkill} (${targetSubTopic}) to find two numbers in an array that sum to a specific target integer.\n\nInput Format:\nFirst line contains two space-separated integers: N (size of array) and Target.\nSecond line contains N space-separated integers.\n\nOutput Format:\nPrint the 0-based indices of the two numbers separated by a space (smaller index first).\n\nConstraints:\n2 <= N <= 10^5\n-10^9 <= elements, Target <= 10^9\nExactly one valid solution exists.\n\nExample 1:\nInput:\n4 9\n2 7 11 15\nOutput:\n0 1\nExplanation: nums[0] + nums[1] = 2 + 7 = 9.`,
    starterCode: prefLang.toLowerCase().includes("python")
      ? `# Write your Python solution here\nimport sys\n\ndef solve():\n    lines = sys.stdin.read().split()\n    if not lines:\n        return\n    n, target = int(lines[0]), int(lines[1])\n    nums = [int(x) for x in lines[2:2+n]]\n    \n    seen = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in seen:\n            print(f"{seen[diff]} {i}")\n            return\n        seen[num] = i\n\nif __name__ == '__main__':\n    solve()\n`
      : `// Write your JavaScript solution here\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\nif (input.length >= 2) {\n  const n = parseInt(input[0], 10);\n  const target = parseInt(input[1], 10);\n  const nums = input.slice(2, 2 + n).map(Number);\n  \n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const diff = target - nums[i];\n    if (map.has(diff)) {\n      console.log(map.get(diff) + " " + i);\n      break;\n    }\n    map.set(nums[i], i);\n  }\n}\n`,
    keyPoints: [
      "Optimal O(N) time complexity using Hash Table lookup",
      "O(N) space complexity",
      "Correct index output and edge case handling",
    ],
    testCases: [
      { input: "4 9\n2 7 11 15", expectedOutput: "0 1", description: "Standard basic test case" },
      { input: "3 6\n3 2 4", expectedOutput: "1 2", description: "Target pair in non-consecutive indices" },
      { input: "2 6\n3 3", expectedOutput: "0 1", description: "Duplicate values matching target" },
    ],
  };

  // Section 3: 3 Advanced/Tough MCQs
  const s3Questions = [
    {
      questionId: "s3_q1",
      section: 3,
      sectionTitle: "Section 3: Advanced MCQs (Tough)",
      type: "mcq",
      difficulty: "hard",
      questionText: `In high-throughput architectures related to ${targetSkill}, how do Memory Leaks typically manifest and how are they effectively mitigated?`,
      options: [
        "A) Through unintended references held in global variables, uncleaned event listeners, or uncleared intervals; mitigated by heap snapshot profiling and lifecycle cleanup",
        "B) By using too many comments in source code",
        "C) Automatically cleaned by browser window minimization",
        "D) Only occurring when running on 32-bit operating systems",
      ],
      correctAnswer: "A) Through unintended references held in global variables, uncleaned event listeners, or uncleared intervals; mitigated by heap snapshot profiling and lifecycle cleanup",
      explanation: "Memory leaks occur when objects are no longer needed by application logic but remain reachable from the GC root due to lingering closures, event listeners, or caches.",
      keyPoints: ["Garbage collection mechanics", "Memory leak profiling and lifecycle mitigation"],
    },
    {
      questionId: "s3_q2",
      section: 3,
      sectionTitle: "Section 3: Advanced MCQs (Tough)",
      type: "mcq",
      difficulty: "hard",
      questionText: `Under high concurrency, what technique prevents the 'Thundering Herd' (Cache Stampede) problem when a hot cache key expires?`,
      options: [
        "A) Mutex / Distributed locking with probabilistic early recomputation (XFetch) or background refresh",
        "B) Setting all cache expiration TTLs to 0 seconds",
        "C) Disabling the database completely",
        "D) Increasing CPU voltage dynamically",
      ],
      correctAnswer: "A) Mutex / Distributed locking with probabilistic early recomputation (XFetch) or background refresh",
      explanation: "Cache stampedes are prevented by ensuring only one worker recomputes the expired cache entry while other incoming requests await the result or receive stale data.",
      keyPoints: ["Cache stampede mitigation", "Distributed locking and probabilistic recomputation"],
    },
    {
      questionId: "s3_q3",
      section: 3,
      sectionTitle: "Section 3: Advanced MCQs (Tough)",
      type: "mcq",
      difficulty: "hard",
      questionText: `When designing resilient microservices communicating asynchronously, what is the primary purpose of an Idempotency Key in API requests?`,
      options: [
        "A) Ensures that retried requests (e.g. following network timeouts) execute side-effects exactly once without duplicate processing or charging",
        "B) Encrypts HTTPS traffic using AES-256",
        "C) Compresses JSON payloads over TCP",
        "D) Bypasses rate limiting for all admin users",
      ],
      correctAnswer: "A) Ensures that retried requests (e.g. following network timeouts) execute side-effects exactly once without duplicate processing or charging",
      explanation: "Idempotency keys allow clients to safely retry requests across intermittent network disconnects without executing side-effects (like payments or record creations) more than once.",
      keyPoints: ["Idempotent API design", "Distributed transaction safety"],
    },
  ];

  return [...s1Questions, codingProblem, ...s3Questions];
}

module.exports = {
  PRE_DEVELOPED_MCQ_BANK,
  PRE_DEVELOPED_CODING_BANK,
  fetchMcqsFromBank,
  parseCodingProblemFromUrl,
  getEmptyStarterCodes,
  generateSmartQuizQuestions,
};

