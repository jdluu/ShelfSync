import { describe, expect, it } from "vitest";
import { cleanHtml } from "@/utils/sanitize";

describe("cleanHtml", () => {
  it("returns empty string for null, undefined, or empty string", () => {
    expect(cleanHtml(null)).toBe("");
    expect(cleanHtml(undefined)).toBe("");
    expect(cleanHtml("")).toBe("");
  });

  it("strips HTML tags cleanly", () => {
    expect(cleanHtml("<p>Hello <strong>World</strong>!</p>")).toBe("Hello World!");
  });

  it("converts <br> and </p> tags to newlines", () => {
    const input = "<p>First paragraph.</p><p>Second paragraph with<br/>a line break.</p>";
    const output = cleanHtml(input);
    expect(output).toContain("First paragraph.");
    expect(output).toContain("Second paragraph with\na line break.");
  });

  it("decodes common HTML entities", () => {
    expect(cleanHtml("Tom &amp; Jerry &lt;3 cheese &quot;always&quot;")).toBe(
      'Tom & Jerry <3 cheese "always"',
    );
    expect(cleanHtml("It&#39;s a test &apos;entity&apos; &nbsp; here")).toBe(
      "It's a test 'entity'   here",
    );
  });

  it("normalizes excessive newlines", () => {
    const input = "Paragraph 1<br><br><br><br><br>Paragraph 2";
    expect(cleanHtml(input)).toBe("Paragraph 1\n\nParagraph 2");
  });
});
