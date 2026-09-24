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

  test("correctly extracts Python runtime error statement and line for ZeroDivisionError", async () => {
    const code = `x = 10
y = 0
print(x // y)`;
    const result = await executeCode({
      code,
      language: "python",
      testCases: [{ input: "", expectedOutput: "5" }],
    });

    expect(result.success).toBe(false);
    expect(result.isRuntimeError).toBe(true);
    expect(result.statement).toContain("ZeroDivisionError: division by zero");
    expect(result.errorLine).toBe(3);
    expect(result.errorMessage).toContain("ZeroDivisionError");
    expect(result.testCaseResults[0].actualOutput).toContain("Runtime Error: ZeroDivisionError");
  });

  test("correctly extracts Java runtime error statement and line for ArrayIndexOutOfBoundsException", async () => {
    const code = `public class Solution {
    public static void main(String[] args) {
        int[] arr = new int[2];
        System.out.println(arr[5]);
    }
}`;
    const result = await executeCode({
      code,
      language: "java",
      testCases: [{ input: "", expectedOutput: "0" }],
    });

    expect(result.success).toBe(false);
    expect(result.isRuntimeError).toBe(true);
    expect(result.statement).toContain("ArrayIndexOutOfBoundsException");
    expect(result.errorLine).toBe(4);
    expect(result.testCaseResults[0].actualOutput).toContain("ArrayIndexOutOfBoundsException");
  });

  test("correctly compiles and runs SQL queries with relational tables", async () => {
    const code = `SELECT
  Person.firstName,
  Person.lastName,
  Address.city,
  Address.state
FROM Person
LEFT JOIN Address ON Person.personId = Address.personId;`;

    const input = `Person table:
+----------+----------+-----------+
| personId | lastName | firstName |
+----------+----------+-----------+
| 1        | Wang     | Allen     |
| 2        | Alice    | Bob       |
+----------+----------+-----------+
Address table:
+-----------+----------+---------------+----------+
| addressId | personId | city          | state    |
+-----------+----------+---------------+----------+
| 1         | 2        | New York City | New York |
| 2         | 3        | Leetcode      | California |
+-----------+----------+---------------+----------+`;

    const expectedOutput = `+-----------+----------+---------------+----------+
| firstName | lastName | city          | state    |
+-----------+----------+---------------+----------+
| Allen     | Wang     | Null          | Null     |
| Bob       | Alice    | New York City | New York |
+-----------+----------+---------------+----------+`;

    const result = await executeCode({
      code,
      language: "sql",
      testCases: [{ input, expectedOutput }],
    });

    expect(result.success).toBe(true);
    expect(result.isCompilationError).toBe(false);
    expect(result.passedCount).toBe(1);
    expect(result.testCaseResults[0].passed).toBe(true);
    expect(result.testCaseResults[0].status).toBe("Passed");
  });

  test("correctly reports SQL syntax compilation errors", async () => {
    const code = `SELECT * FORM Person;`;
    const input = `Person table:
+----------+----------+-----------+
| personId | lastName | firstName |
+----------+----------+-----------+
| 1        | Wang     | Allen     |
+----------+----------+-----------+`;

    const result = await executeCode({
      code,
      language: "sql",
      testCases: [{ input, expectedOutput: "" }],
    });

    expect(result.success).toBe(false);
    expect(result.isCompilationError).toBe(true);
    expect(result.compilationError).toBe(true);
    expect(result.errorMessage).toContain("syntax error");
    expect(result.testCaseResults[0].status).toBe("Compilation Error");
  });
});

