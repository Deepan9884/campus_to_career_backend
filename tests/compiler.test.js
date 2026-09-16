const { executeCode } = require("../src/services/compiler.service");

describe("Compiler Service Execution & Java Diagnostics", () => {
  jest.setTimeout(15000);

  test("successfully compiles and runs Java program with Scanner and dynamic input", async () => {
    const code = `import java.util.Scanner;
public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int a = sc.nextInt();
            int b = sc.nextInt();
            System.out.println(a + b);
        }
    }
}`;
    const result = await executeCode({
      code,
      language: "java",
      testCases: [{ input: "12 18", expectedOutput: "30" }],
    });

    expect(result.success).toBe(true);
    expect(result.isCompilationError).toBe(false);
    expect(result.stdout).toBe("30");
    expect(result.passedCount).toBe(1);
    expect(result.testCaseResults[0].passed).toBe(true);
    expect(result.testCaseResults[0].status).toBe("Passed");
  });

  test("correctly flags Java syntax compilation error without triggering Execution Error", async () => {
    const code = `public class Solution {
    public static void main(String[] args) {
        int a = 10
        System.out.println(a);
    }
}`;
    const result = await executeCode({
      code,
      language: "java",
      testCases: [{ input: "", expectedOutput: "10" }],
    });

    expect(result.success).toBe(false);
    expect(result.isCompilationError).toBe(true);
    expect(result.compilationError).toBe(true);
    expect(result.errorLine).toBe(3);
    expect(result.testCaseResults[0].status).toBe("Compilation Error");
  });

  test("correctly reports Java runtime exceptions (e.g. NoSuchElementException) without AI hijacking", async () => {
    const code = `import java.util.Scanner;
public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt(); // missing in input
        System.out.println(a + b);
    }
}`;
    const result = await executeCode({
      code,
      language: "java",
      testCases: [{ input: "5", expectedOutput: "15" }],
    });

    expect(result.success).toBe(false);
    expect(result.isCompilationError).toBe(false);
    expect(result.isRuntimeError).toBe(true);
    expect(result.testCaseResults[0].status).toBe("Runtime Error");
    expect(result.testCaseResults[0].actualOutput).toContain("NoSuchElementException");
  });

  test("correctly reports failed test cases when Java output does not match expected output", async () => {
    const code = `import java.util.Scanner;
public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a * b); // prints 50 instead of 15
    }
}`;
    const result = await executeCode({
      code,
      language: "java",
      testCases: [{ input: "5 10", expectedOutput: "15" }],
    });

    expect(result.success).toBe(false);
    expect(result.isCompilationError).toBe(false);
    expect(result.isRuntimeError).toBe(false);
    expect(result.testCaseResults[0].passed).toBe(false);
    expect(result.testCaseResults[0].status).toBe("Failed");
    expect(result.testCaseResults[0].actualOutput).toBe("50");
  });

  test("correctly executes JavaScript code", async () => {
    const code = `const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);
if (input.length >= 2) {
  const a = parseInt(input[0], 10);
  const b = parseInt(input[1], 10);
  console.log(a + b);
}`;
    const result = await executeCode({
      code,
      language: "javascript",
      testCases: [{ input: "7 8", expectedOutput: "15" }],
    });

    expect(result.success).toBe(true);
    expect(result.passedCount).toBe(1);
    expect(result.stdout).toBe("15");
  });
});
