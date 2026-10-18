import { describe, expect, it } from "vitest";
import { isValidOpdsCatalogUrl, normalizeCatalogUrl } from "@/utils/url";

describe("isValidOpdsCatalogUrl", () => {
  it("rejects null, undefined, and empty string", () => {
    expect(isValidOpdsCatalogUrl(null)).toBe(false);
    expect(isValidOpdsCatalogUrl(undefined)).toBe(false);
    expect(isValidOpdsCatalogUrl("")).toBe(false);
    expect(isValidOpdsCatalogUrl("   ")).toBe(false);
  });

  it("accepts valid http and https URLs", () => {
    expect(isValidOpdsCatalogUrl("http://example.com/opds")).toBe(true);
    expect(isValidOpdsCatalogUrl("https://example.com/opds")).toBe(true);
    expect(isValidOpdsCatalogUrl("https://192.168.1.100:8080/opds/v1.2/catalog")).toBe(true);
  });

  it("rejects non-http/https protocols", () => {
    expect(isValidOpdsCatalogUrl("ftp://example.com/opds")).toBe(false);
    expect(isValidOpdsCatalogUrl("javascript:alert(1)")).toBe(false);
    expect(isValidOpdsCatalogUrl("file:///home/user/books")).toBe(false);
    expect(isValidOpdsCatalogUrl("data:text/plain;base64,...")).toBe(false);
  });
});

describe("normalizeCatalogUrl", () => {
  it("removes trailing slashes and trims whitespace", () => {
    expect(normalizeCatalogUrl("  https://example.com/opds/  ")).toBe("https://example.com/opds");
    expect(normalizeCatalogUrl("http://example.com///")).toBe("http://example.com");
  });
});
