const { generateSmartQuizQuestions } = require("../src/services/questionBank.service");

describe("Quiz Generation & Topic Precision Tests", () => {
  describe("HTML & CSS Skill Verification Questions", () => {
    test("Generates strictly HTML & CSS questions without DSA or time complexity", () => {
      const questions = generateSmartQuizQuestions({
        skillName: "HTML and CSS",
        subTopicName: "HTML and CSS Core Competency",
        userPreferences: { preferredLanguage: "JavaScript" },
      });

      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBeGreaterThanOrEqual(9);

      const allText = questions
        .map((q) => `${q.questionText} ${q.options?.join(" ") || ""} ${q.keyPoints?.join(" ") || ""}`)
        .join(" ")
        .toLowerCase();

      // Must NOT contain DSA algorithms or time complexity queries
      expect(allText).not.toContain("time complexity");
      expect(allText).not.toContain("two numbers in an array that sum to a specific target");
      expect(allText).not.toContain("binary search tree");
      expect(allText).not.toContain("unsorted array of n elements");
      expect(allText).not.toContain("thundering herd");
      expect(allText).not.toContain("idempotency key");

      // Must contain core HTML & CSS concepts
      expect(allText).toContain("html");
      expect(allText).toContain("css");
      expect(allText).toContain("box-sizing");
      expect(allText).toContain("flexbox");

      // Verify Section 1
      const sec1 = questions.filter((q) => q.section === 1);
      expect(sec1.length).toBe(5);
      expect(sec1.every((q) => q.type === "mcq")).toBe(true);

      // Verify Section 2 (Component implementation challenge, not algorithmic Two-Sum)
      const sec2 = questions.find((q) => q.section === 2);
      expect(sec2).toBeDefined();
      expect(sec2.sectionTitle).toContain("HTML & CSS");
      expect(sec2.starterCode).toContain("card-container");
      expect(sec2.starterCode).toContain("<style>");

      // Verify Section 3 (Advanced Tough MCQs on Stacking Context, Reflow/Repaint, clamp)
      const sec3 = questions.filter((q) => q.section === 3);
      expect(sec3.length).toBe(3);
      const sec3Text = sec3.map((q) => q.questionText).join(" ");
      expect(sec3Text).toContain("Stacking Context");
      expect(sec3Text).toContain("transform");
    });

    test("Also correctly identifies 'HTML & CSS' with ampersand and single words 'CSS' or 'HTML'", () => {
      const qAmp = generateSmartQuizQuestions({ skillName: "HTML & CSS" });
      expect(qAmp[0].questionText).toContain("HTML");

      const qCss = generateSmartQuizQuestions({ skillName: "CSS3" });
      expect(qCss[1].questionText).toContain("box-sizing");

      const qHtml = generateSmartQuizQuestions({ skillName: "HTML5" });
      expect(qHtml[0].questionText).toContain("semantic element");
    });
  });
});
