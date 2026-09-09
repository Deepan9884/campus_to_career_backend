/**
 * Formats and sanitizes LaTeX math notations ($...$, $$...$$, \(...\), \[...\])
 * so questions, options, and explanations store clean, professional text
 * without raw dollar signs ($V$, $E$, $O(N)$) or unrendered LaTeX commands.
 */
function formatMathText(text) {
  if (!text || typeof text !== "string") return "";

  // Helper to clean inside a math segment
  const cleanMathSegment = (math) => {
    let s = math.trim();

    // Remove \left and \right delimiters
    s = s.replace(/\\left\s*([([{\\|.])/g, "$1");
    s = s.replace(/\\right\s*([)\]}\\|.])/g, "$1");

    // Text wrappers
    s = s.replace(/\\text\{([^}]+)\}/g, "$1");
    s = s.replace(/\\mathrm\{([^}]+)\}/g, "$1");
    s = s.replace(/\\mathbf\{([^}]+)\}/g, "$1");
    s = s.replace(/\\mathit\{([^}]+)\}/g, "$1");
    s = s.replace(/\\mathcal\{([^}]+)\}/g, "$1");

    // Fractions \frac{a}{b} -> (a)/(b)
    s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");

    // Square roots \sqrt{x} -> √(x)
    s = s.replace(/\\sqrt\{([^}]+)\}/g, "√($1)");

    // Relations & Operators
    s = s.replace(/\\sum\b/g, "∑");
    s = s.replace(/\\prod\b/g, "∏");
    s = s.replace(/\\le(q)?\b/g, "≤");
    s = s.replace(/\\ge(q)?\b/g, "≥");
    s = s.replace(/\\ne(q)?\b/g, "≠");
    s = s.replace(/\\approx\b/g, "≈");
    s = s.replace(/\\pm\b/g, "±");
    s = s.replace(/\\times\b/g, "×");
    s = s.replace(/\\cdot\b/g, "·");
    s = s.replace(/\\in\b/g, "∈");
    s = s.replace(/\\notin\b/g, "∉");
    s = s.replace(/\\subset(eq)?\b/g, "⊆");
    s = s.replace(/\\cap\b/g, "∩");
    s = s.replace(/\\cup\b/g, "∪");
    s = s.replace(/\\infty\b/g, "∞");
    s = s.replace(/\\(to|rightarrow)\b/g, "→");
    s = s.replace(/\\leftarrow\b/g, "←");
    s = s.replace(/\\(dots|ldots)\b/g, "...");

    // Greek & Complexity letters
    s = s.replace(/\\Theta\b/g, "Θ");
    s = s.replace(/\\theta\b/g, "θ");
    s = s.replace(/\\Omega\b/g, "Ω");
    s = s.replace(/\\omega\b/g, "ω");
    s = s.replace(/\\alpha\b/g, "α");
    s = s.replace(/\\beta\b/g, "β");
    s = s.replace(/\\gamma\b/g, "γ");
    s = s.replace(/\\lambda\b/g, "λ");
    s = s.replace(/\\mu\b/g, "μ");
    s = s.replace(/\\pi\b/g, "π");
    s = s.replace(/\\sigma\b/g, "σ");

    // Standard Math & CS Functions
    s = s.replace(/\\log\b/g, "log");
    s = s.replace(/\\ln\b/g, "ln");
    s = s.replace(/\\exp\b/g, "exp");
    s = s.replace(/\\min\b/g, "min");
    s = s.replace(/\\max\b/g, "max");
    s = s.replace(/\\det\b/g, "det");
    s = s.replace(/\\gcd\b/g, "gcd");

    // Common Superscripts (Unicode)
    const superscripts = {
      "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
      "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
      "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
      "n": "ⁿ", "i": "ⁱ", "k": "ᵏ", "x": "ˣ", "y": "ʸ",
    };
    s = s.replace(/\^\{([0-9nki+-=()xy]+)\}/g, (_, exp) =>
      exp.split("").map((ch) => superscripts[ch] || ch).join("")
    );
    s = s.replace(/\^([0-9nki+-=()xy])/g, (_, ch) => superscripts[ch] || `^${ch}`);
    s = s.replace(/\^\{([^}]+)\}/g, "^($1)");
    s = s.replace(/_\{([^}]+)\}/g, "_($1)");

    // Strip remaining lone backslashes before plain alphabetic words
    s = s.replace(/\\([a-zA-Z]+)/g, "$1");

    return s;
  };

  // Protect code blocks (fenced ``` and inline `) from math replacement
  const codeBlocks = [];
  let processed = text.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    codeBlocks.push(match);
    return `___CODE_BLOCK_${codeBlocks.length - 1}___`;
  });

  // Display math: $$...$$ or \[...\]
  processed = processed.replace(/\$\$([^\$]+)\$\$/g, (_, math) => cleanMathSegment(math));
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => cleanMathSegment(math));

  // Inline math: $...$ or \(...\)
  processed = processed.replace(/\$([^\$\n]+)\$/g, (_, math) => cleanMathSegment(math));
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => cleanMathSegment(math));

  // Restore protected code blocks
  processed = processed.replace(/___CODE_BLOCK_(\d+)___/g, (_, idx) => codeBlocks[Number(idx)] || "");

  return processed;
}

module.exports = { formatMathText };
