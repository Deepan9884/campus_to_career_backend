/**
 * Comprehensive Problem Bank
 * --------------------------
 * 180+ curated problems across 20+ DSA topics and 5 coding platforms.
 * Each entry: { topic, title, url, difficulty, platform }
 *
 * Platforms: leetcode, gfg, hackerrank, codechef, codeforces
 * Difficulties: Easy, Medium, Hard
 */

const problemBank = [
    // ──────────────────────────────────────────────────────────────
    // Arrays
    // ──────────────────────────────────────────────────────────────
    { topic: "Arrays", title: "Two Sum", url: "https://leetcode.com/problems/two-sum/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Arrays", title: "Best Time to Buy and Sell Stock", url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Arrays", title: "Maximum Subarray", url: "https://leetcode.com/problems/maximum-subarray/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Arrays", title: "Product of Array Except Self", url: "https://leetcode.com/problems/product-of-array-except-self/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Arrays", title: "First Missing Positive", url: "https://leetcode.com/problems/first-missing-positive/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Arrays", title: "Trapping Rain Water", url: "https://leetcode.com/problems/trapping-rain-water/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Arrays", title: "Leaders in an Array", url: "https://www.geeksforgeeks.org/problems/leaders-in-an-array-1587115620/1", difficulty: "Easy", platform: "gfg" },
    { topic: "Arrays", title: "Subarray with Given Sum", url: "https://www.geeksforgeeks.org/problems/subarray-with-given-sum-1587115621/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Arrays", title: "Array Manipulation", url: "https://www.hackerrank.com/challenges/crush/problem", difficulty: "Hard", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Hashing
    // ──────────────────────────────────────────────────────────────
    { topic: "Hashing", title: "Valid Anagram", url: "https://leetcode.com/problems/valid-anagram/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Hashing", title: "Group Anagrams", url: "https://leetcode.com/problems/group-anagrams/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Hashing", title: "Top K Frequent Elements", url: "https://leetcode.com/problems/top-k-frequent-elements/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Hashing", title: "Longest Consecutive Sequence", url: "https://leetcode.com/problems/longest-consecutive-sequence/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Hashing", title: "Subarray Sum Equals K", url: "https://leetcode.com/problems/subarray-sum-equals-k/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Hashing", title: "Count Distinct Elements in Every Window", url: "https://www.geeksforgeeks.org/problems/count-distinct-elements-in-every-window/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Hashing", title: "Sherlock and Anagrams", url: "https://www.hackerrank.com/challenges/sherlock-and-anagrams/problem", difficulty: "Medium", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Two Pointers
    // ──────────────────────────────────────────────────────────────
    { topic: "Two Pointers", title: "Valid Palindrome", url: "https://leetcode.com/problems/valid-palindrome/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Two Pointers", title: "3Sum", url: "https://leetcode.com/problems/3sum/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Two Pointers", title: "Container With Most Water", url: "https://leetcode.com/problems/container-with-most-water/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Two Pointers", title: "4Sum", url: "https://leetcode.com/problems/4sum/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Two Pointers", title: "Remove Duplicates from Sorted Array", url: "https://leetcode.com/problems/remove-duplicates-from-sorted-array/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Two Pointers", title: "Pairs with Specific Difference", url: "https://www.geeksforgeeks.org/problems/pairs-with-specific-difference1533/1", difficulty: "Easy", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Sliding Window
    // ──────────────────────────────────────────────────────────────
    { topic: "Sliding Window", title: "Longest Substring Without Repeating Characters", url: "https://leetcode.com/problems/longest-substring-without-repeating-characters/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Sliding Window", title: "Minimum Window Substring", url: "https://leetcode.com/problems/minimum-window-substring/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Sliding Window", title: "Permutation in String", url: "https://leetcode.com/problems/permutation-in-string/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Sliding Window", title: "Sliding Window Maximum", url: "https://leetcode.com/problems/sliding-window-maximum/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Sliding Window", title: "Max Sum Subarray of Size K", url: "https://www.geeksforgeeks.org/problems/max-sum-subarray-of-size-k5313/1", difficulty: "Easy", platform: "gfg" },
    { topic: "Sliding Window", title: "Longest K Unique Characters Substring", url: "https://www.geeksforgeeks.org/problems/longest-k-unique-characters-substring0853/1", difficulty: "Medium", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Stack
    // ──────────────────────────────────────────────────────────────
    { topic: "Stack", title: "Valid Parentheses", url: "https://leetcode.com/problems/valid-parentheses/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Stack", title: "Evaluate Reverse Polish Notation", url: "https://leetcode.com/problems/evaluate-reverse-polish-notation/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Stack", title: "Largest Rectangle in Histogram", url: "https://leetcode.com/problems/largest-rectangle-in-histogram/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Stack", title: "Daily Temperatures", url: "https://leetcode.com/problems/daily-temperatures/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Stack", title: "Min Stack", url: "https://leetcode.com/problems/min-stack/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Stack", title: "Next Greater Element", url: "https://www.geeksforgeeks.org/problems/next-larger-element-1587115620/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Stack", title: "Balanced Brackets", url: "https://www.hackerrank.com/challenges/balanced-brackets/problem", difficulty: "Medium", platform: "hackerrank" },
    { topic: "Stack", title: "Stock Span Problem", url: "https://www.geeksforgeeks.org/problems/stock-span-problem-1587115621/1", difficulty: "Medium", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Binary Search
    // ──────────────────────────────────────────────────────────────
    { topic: "Binary Search", title: "Binary Search", url: "https://leetcode.com/problems/binary-search/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Binary Search", title: "Find Minimum in Rotated Sorted Array", url: "https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Binary Search", title: "Search in Rotated Sorted Array", url: "https://leetcode.com/problems/search-in-rotated-sorted-array/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Binary Search", title: "Median of Two Sorted Arrays", url: "https://leetcode.com/problems/median-of-two-sorted-arrays/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Binary Search", title: "Koko Eating Bananas", url: "https://leetcode.com/problems/koko-eating-bananas/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Binary Search", title: "Aggressive Cows", url: "https://www.geeksforgeeks.org/problems/aggressive-cows/1", difficulty: "Hard", platform: "gfg" },
    { topic: "Binary Search", title: "Allocate Minimum Pages", url: "https://www.geeksforgeeks.org/problems/allocate-minimum-number-of-pages0937/1", difficulty: "Hard", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Linked List
    // ──────────────────────────────────────────────────────────────
    { topic: "Linked List", title: "Reverse Linked List", url: "https://leetcode.com/problems/reverse-linked-list/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Linked List", title: "Merge Two Sorted Lists", url: "https://leetcode.com/problems/merge-two-sorted-lists/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Linked List", title: "Reorder List", url: "https://leetcode.com/problems/reorder-list/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Linked List", title: "Linked List Cycle", url: "https://leetcode.com/problems/linked-list-cycle/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Linked List", title: "LRU Cache", url: "https://leetcode.com/problems/lru-cache/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Linked List", title: "Copy List with Random Pointer", url: "https://leetcode.com/problems/copy-list-with-random-pointer/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Linked List", title: "Merge K Sorted Lists", url: "https://leetcode.com/problems/merge-k-sorted-lists/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Linked List", title: "Flattening a Linked List", url: "https://www.geeksforgeeks.org/problems/flattening-a-linked-list/1", difficulty: "Medium", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Trees
    // ──────────────────────────────────────────────────────────────
    { topic: "Trees", title: "Invert Binary Tree", url: "https://leetcode.com/problems/invert-binary-tree/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Trees", title: "Maximum Depth of Binary Tree", url: "https://leetcode.com/problems/maximum-depth-of-binary-tree/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Trees", title: "Binary Tree Level Order Traversal", url: "https://leetcode.com/problems/binary-tree-level-order-traversal/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Trees", title: "Validate Binary Search Tree", url: "https://leetcode.com/problems/validate-binary-search-tree/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Trees", title: "Lowest Common Ancestor of a Binary Tree", url: "https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Trees", title: "Binary Tree Maximum Path Sum", url: "https://leetcode.com/problems/binary-tree-maximum-path-sum/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Trees", title: "Serialize and Deserialize Binary Tree", url: "https://leetcode.com/problems/serialize-and-deserialize-binary-tree/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Trees", title: "Diameter of Binary Tree", url: "https://leetcode.com/problems/diameter-of-binary-tree/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Trees", title: "Tree: Height of a Binary Tree", url: "https://www.hackerrank.com/challenges/tree-height-of-a-binary-tree/problem", difficulty: "Easy", platform: "hackerrank" },
    { topic: "Trees", title: "Bottom View of Binary Tree", url: "https://www.geeksforgeeks.org/problems/bottom-view-of-binary-tree/1", difficulty: "Medium", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Tries
    // ──────────────────────────────────────────────────────────────
    { topic: "Tries", title: "Implement Trie (Prefix Tree)", url: "https://leetcode.com/problems/implement-trie-prefix-tree/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Tries", title: "Design Add and Search Words Data Structure", url: "https://leetcode.com/problems/design-add-and-search-words-data-structure/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Tries", title: "Word Search II", url: "https://leetcode.com/problems/word-search-ii/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Tries", title: "Contacts", url: "https://www.hackerrank.com/challenges/contacts/problem", difficulty: "Medium", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Graphs
    // ──────────────────────────────────────────────────────────────
    { topic: "Graphs", title: "Number of Islands", url: "https://leetcode.com/problems/number-of-islands/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Graphs", title: "Clone Graph", url: "https://leetcode.com/problems/clone-graph/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Graphs", title: "Course Schedule", url: "https://leetcode.com/problems/course-schedule/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Graphs", title: "Word Ladder", url: "https://leetcode.com/problems/word-ladder/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Graphs", title: "Network Delay Time", url: "https://leetcode.com/problems/network-delay-time/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Graphs", title: "Cheapest Flights Within K Stops", url: "https://leetcode.com/problems/cheapest-flights-within-k-stops/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Graphs", title: "Alien Dictionary", url: "https://leetcode.com/problems/alien-dictionary/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Graphs", title: "BFS: Shortest Reach in a Graph", url: "https://www.hackerrank.com/challenges/bfsshortreach/problem", difficulty: "Medium", platform: "hackerrank" },
    { topic: "Graphs", title: "DFS of Graph", url: "https://www.geeksforgeeks.org/problems/depth-first-traversal-for-a-graph/1", difficulty: "Easy", platform: "gfg" },
    { topic: "Graphs", title: "Topological Sort", url: "https://www.geeksforgeeks.org/problems/topological-sort/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Graphs", title: "Shortest Path in Undirected Graph", url: "https://www.geeksforgeeks.org/problems/shortest-path-in-undirected-graph-having-unit-distance/1", difficulty: "Medium", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Dynamic Programming
    // ──────────────────────────────────────────────────────────────
    { topic: "Dynamic Programming", title: "Climbing Stairs", url: "https://leetcode.com/problems/climbing-stairs/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Dynamic Programming", title: "Coin Change", url: "https://leetcode.com/problems/coin-change/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Dynamic Programming", title: "Longest Increasing Subsequence", url: "https://leetcode.com/problems/longest-increasing-subsequence/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Dynamic Programming", title: "Longest Common Subsequence", url: "https://leetcode.com/problems/longest-common-subsequence/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Dynamic Programming", title: "House Robber", url: "https://leetcode.com/problems/house-robber/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Dynamic Programming", title: "Unique Paths", url: "https://leetcode.com/problems/unique-paths/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Dynamic Programming", title: "Edit Distance", url: "https://leetcode.com/problems/edit-distance/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Dynamic Programming", title: "Word Break", url: "https://leetcode.com/problems/word-break/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Dynamic Programming", title: "Partition Equal Subset Sum", url: "https://leetcode.com/problems/partition-equal-subset-sum/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Dynamic Programming", title: "Burst Balloons", url: "https://leetcode.com/problems/burst-balloons/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Dynamic Programming", title: "0-1 Knapsack Problem", url: "https://www.geeksforgeeks.org/problems/0-1-knapsack-problem0945/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Dynamic Programming", title: "Matrix Chain Multiplication", url: "https://www.geeksforgeeks.org/problems/matrix-chain-multiplication0303/1", difficulty: "Hard", platform: "gfg" },
    { topic: "Dynamic Programming", title: "Abbreviation", url: "https://www.hackerrank.com/challenges/abbr/problem", difficulty: "Medium", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Greedy Algorithms (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Greedy", title: "Jump Game", url: "https://leetcode.com/problems/jump-game/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Greedy", title: "Jump Game II", url: "https://leetcode.com/problems/jump-game-ii/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Greedy", title: "Gas Station", url: "https://leetcode.com/problems/gas-station/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Greedy", title: "Task Scheduler", url: "https://leetcode.com/problems/task-scheduler/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Greedy", title: "Non-overlapping Intervals", url: "https://leetcode.com/problems/non-overlapping-intervals/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Greedy", title: "Minimum Number of Platforms", url: "https://www.geeksforgeeks.org/problems/minimum-platforms-1587115620/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Greedy", title: "Activity Selection", url: "https://www.geeksforgeeks.org/problems/activity-selection-1587115620/1", difficulty: "Easy", platform: "gfg" },
    { topic: "Greedy", title: "Fractional Knapsack", url: "https://www.geeksforgeeks.org/problems/fractional-knapsack-1587115620/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Greedy", title: "Luck Balance", url: "https://www.hackerrank.com/challenges/luck-balance/problem", difficulty: "Easy", platform: "hackerrank" },
    { topic: "Greedy", title: "Minimum Absolute Difference in an Array", url: "https://www.hackerrank.com/challenges/minimum-absolute-difference-in-an-array/problem", difficulty: "Easy", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Backtracking (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Backtracking", title: "Subsets", url: "https://leetcode.com/problems/subsets/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Backtracking", title: "Permutations", url: "https://leetcode.com/problems/permutations/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Backtracking", title: "Combination Sum", url: "https://leetcode.com/problems/combination-sum/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Backtracking", title: "Word Search", url: "https://leetcode.com/problems/word-search/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Backtracking", title: "N-Queens", url: "https://leetcode.com/problems/n-queens/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Backtracking", title: "Sudoku Solver", url: "https://leetcode.com/problems/sudoku-solver/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Backtracking", title: "Palindrome Partitioning", url: "https://leetcode.com/problems/palindrome-partitioning/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Backtracking", title: "Rat in a Maze", url: "https://www.geeksforgeeks.org/problems/rat-in-a-maze-problem/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Backtracking", title: "Recursive Digit Sum", url: "https://www.hackerrank.com/challenges/recursive-digit-sum/problem", difficulty: "Medium", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Bit Manipulation (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Bit Manipulation", title: "Single Number", url: "https://leetcode.com/problems/single-number/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Bit Manipulation", title: "Number of 1 Bits", url: "https://leetcode.com/problems/number-of-1-bits/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Bit Manipulation", title: "Counting Bits", url: "https://leetcode.com/problems/counting-bits/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Bit Manipulation", title: "Reverse Bits", url: "https://leetcode.com/problems/reverse-bits/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Bit Manipulation", title: "Missing Number", url: "https://leetcode.com/problems/missing-number/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Bit Manipulation", title: "Power of Two", url: "https://leetcode.com/problems/power-of-two/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Bit Manipulation", title: "Bit Difference", url: "https://www.geeksforgeeks.org/problems/bit-difference-1587115620/1", difficulty: "Easy", platform: "gfg" },
    { topic: "Bit Manipulation", title: "Lonely Integer", url: "https://www.hackerrank.com/challenges/lonely-integer/problem", difficulty: "Easy", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Math & Number Theory (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Math", title: "Reverse Integer", url: "https://leetcode.com/problems/reverse-integer/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Math", title: "Palindrome Number", url: "https://leetcode.com/problems/palindrome-number/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Math", title: "Pow(x, n)", url: "https://leetcode.com/problems/powx-n/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Math", title: "Count Primes", url: "https://leetcode.com/problems/count-primes/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Math", title: "Happy Number", url: "https://leetcode.com/problems/happy-number/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Math", title: "Excel Sheet Column Title", url: "https://leetcode.com/problems/excel-sheet-column-title/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Math", title: "Sieve of Eratosthenes", url: "https://www.geeksforgeeks.org/problems/sieve-of-eratosthenes5242/1", difficulty: "Easy", platform: "gfg" },
    { topic: "Math", title: "Modular Exponentiation", url: "https://www.geeksforgeeks.org/problems/modular-exponentiation-for-large-numbers5537/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Math", title: "Project Euler #1", url: "https://www.hackerrank.com/contests/projecteuler/challenges/euler001/problem", difficulty: "Easy", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Heap / Priority Queue (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Heap", title: "Kth Largest Element in an Array", url: "https://leetcode.com/problems/kth-largest-element-in-an-array/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Heap", title: "Find Median from Data Stream", url: "https://leetcode.com/problems/find-median-from-data-stream/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Heap", title: "Top K Frequent Words", url: "https://leetcode.com/problems/top-k-frequent-words/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Heap", title: "K Closest Points to Origin", url: "https://leetcode.com/problems/k-closest-points-to-origin/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Heap", title: "Reorganize String", url: "https://leetcode.com/problems/reorganize-string/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Heap", title: "Merge K Sorted Arrays", url: "https://www.geeksforgeeks.org/problems/merge-k-sorted-arrays/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Heap", title: "Jesse and Cookies", url: "https://www.hackerrank.com/challenges/jesse-and-cookies/problem", difficulty: "Easy", platform: "hackerrank" },
    { topic: "Heap", title: "Kth Smallest Element", url: "https://www.geeksforgeeks.org/problems/kth-smallest-element5635/1", difficulty: "Medium", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Recursion (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Recursion", title: "Letter Combinations of a Phone Number", url: "https://leetcode.com/problems/letter-combinations-of-a-phone-number/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Recursion", title: "Generate Parentheses", url: "https://leetcode.com/problems/generate-parentheses/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Recursion", title: "Flatten Nested List Iterator", url: "https://leetcode.com/problems/flatten-nested-list-iterator/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Recursion", title: "Tower of Hanoi", url: "https://www.geeksforgeeks.org/problems/tower-of-hanoi-1587115621/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Recursion", title: "Power Sum", url: "https://www.hackerrank.com/challenges/the-power-sum/problem", difficulty: "Medium", platform: "hackerrank" },
    { topic: "Recursion", title: "Josephus Problem", url: "https://www.geeksforgeeks.org/problems/josephus-problem/1", difficulty: "Medium", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // String Algorithms (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Strings", title: "Longest Palindromic Substring", url: "https://leetcode.com/problems/longest-palindromic-substring/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Strings", title: "String to Integer (atoi)", url: "https://leetcode.com/problems/string-to-integer-atoi/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Strings", title: "Longest Common Prefix", url: "https://leetcode.com/problems/longest-common-prefix/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Strings", title: "Regular Expression Matching", url: "https://leetcode.com/problems/regular-expression-matching/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Strings", title: "Minimum Window Substring", url: "https://leetcode.com/problems/minimum-window-substring/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Strings", title: "Encode and Decode Strings", url: "https://leetcode.com/problems/encode-and-decode-strings/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Strings", title: "Rabin-Karp Algorithm", url: "https://www.geeksforgeeks.org/problems/search-pattern-rabin-karp-algorithm4012/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Strings", title: "KMP Algorithm", url: "https://www.geeksforgeeks.org/problems/search-pattern0205/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Strings", title: "Two Strings", url: "https://www.hackerrank.com/challenges/two-strings/problem", difficulty: "Easy", platform: "hackerrank" },
    { topic: "Strings", title: "Common Child", url: "https://www.hackerrank.com/challenges/common-child/problem", difficulty: "Medium", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Segment Trees / Fenwick Trees (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Segment Trees", title: "Range Sum Query - Mutable", url: "https://leetcode.com/problems/range-sum-query-mutable/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Segment Trees", title: "Count of Smaller Numbers After Self", url: "https://leetcode.com/problems/count-of-smaller-numbers-after-self/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Segment Trees", title: "Range Minimum Query", url: "https://www.geeksforgeeks.org/problems/range-minimum-query/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Segment Trees", title: "Xenia and Bit Operations", url: "https://codeforces.com/problemset/problem/339/D", difficulty: "Medium", platform: "codeforces" },

    // ──────────────────────────────────────────────────────────────
    // Union-Find / Disjoint Set (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Union-Find", title: "Redundant Connection", url: "https://leetcode.com/problems/redundant-connection/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Union-Find", title: "Number of Connected Components", url: "https://leetcode.com/problems/number-of-connected-components-in-an-undirected-graph/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Union-Find", title: "Accounts Merge", url: "https://leetcode.com/problems/accounts-merge/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Union-Find", title: "Disjoint Set Union-Find", url: "https://www.geeksforgeeks.org/problems/disjoint-set-union-find/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Union-Find", title: "Merging Communities", url: "https://www.hackerrank.com/challenges/merging-communities/problem", difficulty: "Medium", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Intervals (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Intervals", title: "Merge Intervals", url: "https://leetcode.com/problems/merge-intervals/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Intervals", title: "Insert Interval", url: "https://leetcode.com/problems/insert-interval/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Intervals", title: "Non-overlapping Intervals", url: "https://leetcode.com/problems/non-overlapping-intervals/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Intervals", title: "Meeting Rooms II", url: "https://leetcode.com/problems/meeting-rooms-ii/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Intervals", title: "Minimum Number of Arrows to Burst Balloons", url: "https://leetcode.com/problems/minimum-number-of-arrows-to-burst-balloons/", difficulty: "Medium", platform: "leetcode" },

    // ──────────────────────────────────────────────────────────────
    // Matrix / 2D Arrays (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Matrix", title: "Set Matrix Zeroes", url: "https://leetcode.com/problems/set-matrix-zeroes/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Matrix", title: "Spiral Matrix", url: "https://leetcode.com/problems/spiral-matrix/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Matrix", title: "Rotate Image", url: "https://leetcode.com/problems/rotate-image/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Matrix", title: "Word Search", url: "https://leetcode.com/problems/word-search/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Matrix", title: "Search a 2D Matrix", url: "https://leetcode.com/problems/search-a-2d-matrix/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Matrix", title: "Spirally Traversing a Matrix", url: "https://www.geeksforgeeks.org/problems/spirally-traversing-a-matrix-1587115621/1", difficulty: "Medium", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Sorting Algorithms (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Sorting", title: "Sort Colors", url: "https://leetcode.com/problems/sort-colors/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Sorting", title: "Merge Sort - Counting Inversions", url: "https://www.hackerrank.com/challenges/ctci-merge-sort/problem", difficulty: "Hard", platform: "hackerrank" },
    { topic: "Sorting", title: "Insertion Sort - Part 1", url: "https://www.hackerrank.com/challenges/insertionsort1/problem", difficulty: "Easy", platform: "hackerrank" },
    { topic: "Sorting", title: "Quicksort 1 - Partition", url: "https://www.hackerrank.com/challenges/quicksort1/problem", difficulty: "Easy", platform: "hackerrank" },
    { topic: "Sorting", title: "Turbo Sort", url: "https://www.codechef.com/problems/TURBO", difficulty: "Easy", platform: "codechef" },
    { topic: "Sorting", title: "Merge Sort (GFG)", url: "https://www.geeksforgeeks.org/problems/merge-sort/1", difficulty: "Medium", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Divide and Conquer (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Divide and Conquer", title: "Merge Sort on Linked List", url: "https://leetcode.com/problems/sort-list/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Divide and Conquer", title: "Majority Element", url: "https://leetcode.com/problems/majority-element/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Divide and Conquer", title: "Maximum Subarray (D&C)", url: "https://leetcode.com/problems/maximum-subarray/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Divide and Conquer", title: "Count Inversions", url: "https://www.geeksforgeeks.org/problems/inversion-of-array-1587115620/1", difficulty: "Medium", platform: "gfg" },

    // ──────────────────────────────────────────────────────────────
    // Design / OOP (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Design", title: "LRU Cache", url: "https://leetcode.com/problems/lru-cache/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Design", title: "LFU Cache", url: "https://leetcode.com/problems/lfu-cache/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Design", title: "Design Twitter", url: "https://leetcode.com/problems/design-twitter/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Design", title: "Implement Stack using Queues", url: "https://leetcode.com/problems/implement-stack-using-queues/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Design", title: "Design HashMap", url: "https://leetcode.com/problems/design-hashmap/", difficulty: "Easy", platform: "leetcode" },

    // ──────────────────────────────────────────────────────────────
    // Queue / Deque (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Queue", title: "Implement Queue using Stacks", url: "https://leetcode.com/problems/implement-queue-using-stacks/", difficulty: "Easy", platform: "leetcode" },
    { topic: "Queue", title: "Sliding Window Maximum", url: "https://leetcode.com/problems/sliding-window-maximum/", difficulty: "Hard", platform: "leetcode" },
    { topic: "Queue", title: "Rotten Oranges", url: "https://leetcode.com/problems/rotting-oranges/", difficulty: "Medium", platform: "leetcode" },
    { topic: "Queue", title: "Circular Tour", url: "https://www.geeksforgeeks.org/problems/circular-tour-1587115620/1", difficulty: "Medium", platform: "gfg" },
    { topic: "Queue", title: "Queue using Two Stacks", url: "https://www.hackerrank.com/challenges/queue-using-two-stacks/problem", difficulty: "Medium", platform: "hackerrank" },

    // ──────────────────────────────────────────────────────────────
    // Competitive Programming / Miscellaneous (NEW)
    // ──────────────────────────────────────────────────────────────
    { topic: "Competitive", title: "Chef and Notebooks", url: "https://www.codechef.com/problems/CNOTE", difficulty: "Easy", platform: "codechef" },
    { topic: "Competitive", title: "ATM Problem", url: "https://www.codechef.com/problems/HS08TEST", difficulty: "Easy", platform: "codechef" },
    { topic: "Competitive", title: "Small Factorials", url: "https://www.codechef.com/problems/FCTRL2", difficulty: "Easy", platform: "codechef" },
    { topic: "Competitive", title: "Enormous Input Test", url: "https://www.codechef.com/problems/INTEST", difficulty: "Easy", platform: "codechef" },
    { topic: "Competitive", title: "Watermelon", url: "https://codeforces.com/problemset/problem/4/A", difficulty: "Easy", platform: "codeforces" },
    { topic: "Competitive", title: "Theatre Square", url: "https://codeforces.com/problemset/problem/1/A", difficulty: "Easy", platform: "codeforces" },
    { topic: "Competitive", title: "Beautiful Matrix", url: "https://codeforces.com/problemset/problem/263/A", difficulty: "Easy", platform: "codeforces" },
    { topic: "Competitive", title: "Bit++", url: "https://codeforces.com/problemset/problem/282/A", difficulty: "Easy", platform: "codeforces" },
];

module.exports = problemBank;
