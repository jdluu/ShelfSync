import { beforeEach, describe, expect, it } from "vitest";
import { formatRegistry } from "@/services/formatRegistry";

describe("formatRegistry", () => {
  beforeEach(() => {
    formatRegistry.reset();
  });

  it("identifies default downloadable formats (EPUB and PDF)", () => {
    expect(formatRegistry.isDownloadable("application/epub+zip")).toBe(true);
    expect(formatRegistry.isDownloadable("application/pdf")).toBe(true);
    expect(formatRegistry.isDownloadable("text/html")).toBe(false);
    expect(formatRegistry.isDownloadable(null)).toBe(false);
  });

  it("retrieves labels for known formats", () => {
    expect(formatRegistry.getLabel("application/epub+zip")).toBe("EPUB");
    expect(formatRegistry.getLabel("application/pdf")).toBe("PDF");
    expect(formatRegistry.getLabel("application/x-mobipocket-ebook")).toBe("MOBI");
  });

  it("falls back to raw media type for unregistered formats", () => {
    expect(formatRegistry.getLabel("application/x-cbz")).toBe("application/x-cbz");
  });

  it("allows registering new formats without modifying existing code (OCP)", () => {
    expect(formatRegistry.isDownloadable("application/vnd.comicbook+zip")).toBe(false);

    formatRegistry.registerFormat({
      mediaType: "application/vnd.comicbook+zip",
      label: "CBZ",
      extension: ".cbz",
      downloadable: true,
    });

    expect(formatRegistry.isDownloadable("application/vnd.comicbook+zip")).toBe(true);
    expect(formatRegistry.getLabel("application/vnd.comicbook+zip")).toBe("CBZ");
  });
});
