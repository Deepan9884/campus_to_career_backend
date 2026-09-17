const { synthesizeSpeech } = require("../src/services/foreignLanguage.service");

describe("Foreign Language TTS Synthesis Tests", () => {
  test("synthesizes valid MP3 audio buffer for Japanese listening passage", async () => {
    const japaneseText = "みなさん、おはようございます。つぎは、しんじゅくです。";
    const audioBuffer = await synthesizeSpeech(japaneseText, "Japanese");

    expect(Buffer.isBuffer(audioBuffer)).toBe(true);
    expect(audioBuffer.length).toBeGreaterThan(5000); // Real audio file, not empty or null
  }, 15000);

  test("serves cached audio buffer for repeated requests", async () => {
    const text = "こんにちは。";
    const buf1 = await synthesizeSpeech(text, "Japanese");
    const buf2 = await synthesizeSpeech(text, "Japanese");

    expect(buf1).toBe(buf2); // Exact cached reference
  }, 10000);

  test("rejects empty text with clear error", async () => {
    await expect(synthesizeSpeech("", "Japanese")).rejects.toThrow("Empty text");
    await expect(synthesizeSpeech("   ", "Japanese")).rejects.toThrow("Empty text");
  });
});
