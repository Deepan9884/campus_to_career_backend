const { sanitizeInput } = require("../src/middleware/sanitize.middleware");
const { validateFileMagicBytes } = require("../src/utils/fileValidation");
const fs = require("fs");
const path = require("path");
const os = require("os");

describe("Security Hardening & Input Sanitization Tests", () => {
  test("NoSQL Injection: strips $ and . operator keys and prototype pollution keys", () => {
    const maliciousPayload = {
      email: { $gt: "" },
      password: "password123",
      nested: {
        $where: "function() { return true; }",
        normalKey: "validValue",
        "invalid.dot.key": "bad",
      },
      __proto__: { admin: true },
      arrayField: [{ $ne: null }, "safeString"],
    };

    const cleaned = sanitizeInput(maliciousPayload);

    expect(cleaned.email).toEqual({});
    expect(cleaned.password).toBe("password123");
    expect(cleaned.nested.$where).toBeUndefined();
    expect(cleaned.nested.normalKey).toBe("validValue");
    expect(cleaned.nested["invalid.dot.key"]).toBeUndefined();
    expect(cleaned.admin).toBeUndefined();
    expect(cleaned.arrayField[0]).toEqual({});
    expect(cleaned.arrayField[1]).toBe("safeString");
  });

  test("File Validation: correctly detects valid PDF magic bytes (%PDF-)", () => {
    const tmpPdf = path.join(os.tmpdir(), `test-valid-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPdf, Buffer.from("%PDF-1.4 sample pdf content"));

    const isValid = validateFileMagicBytes(tmpPdf, [".pdf"]);
    fs.unlinkSync(tmpPdf);

    expect(isValid).toBe(true);
  });

  test("File Validation: rejects spoofed executable/HTML file disguised as .pdf", () => {
    const tmpSpoofedPdf = path.join(os.tmpdir(), `test-spoofed-${Date.now()}.pdf`);
    fs.writeFileSync(tmpSpoofedPdf, Buffer.from("<script>alert('xss')</script>"));

    const isValid = validateFileMagicBytes(tmpSpoofedPdf, [".pdf"]);
    fs.unlinkSync(tmpSpoofedPdf);

    expect(isValid).toBe(false);
  });

  test("File Validation: correctly detects valid PNG magic bytes", () => {
    const tmpPng = path.join(os.tmpdir(), `test-valid-${Date.now()}.png`);
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(tmpPng, pngHeader);

    const isValid = validateFileMagicBytes(tmpPng, [".png"]);
    fs.unlinkSync(tmpPng);

    expect(isValid).toBe(true);
  });

  test("File Validation: correctly detects valid JPEG magic bytes", () => {
    const tmpJpg = path.join(os.tmpdir(), `test-valid-${Date.now()}.jpg`);
    const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    fs.writeFileSync(tmpJpg, jpgHeader);

    const isValid = validateFileMagicBytes(tmpJpg, [".jpg", ".jpeg"]);
    fs.unlinkSync(tmpJpg);

    expect(isValid).toBe(true);
  });
});
