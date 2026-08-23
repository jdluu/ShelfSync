import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { opdsClient } from "@/services/opdsClient";
import type { MediaType } from "@/types/opds";
import * as tauri from "@/utils/tauri";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("@/utils/tauri", () => ({
  safeInvoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

const mockSafeInvoke = vi.mocked(tauri.safeInvoke);

describe("opdsClient.fetchCatalog", () => {
  beforeEach(() => {
    mockSafeInvoke.mockResolvedValue({
      title: "Test Catalog",
      updated: "2024-01-01T00:00:00Z",
      authors: ["Test Author"],
      links: [],
      publications: [],
      pagination: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes fetch_opds_catalog with correct parameters", async () => {
    const params = {
      url: "https://example.com/opds",
      username: "testuser",
      password: "testpass",
      page: 1,
      page_size: 50,
    };

    await opdsClient.fetchCatalog(params);

    expect(mockSafeInvoke).toHaveBeenCalledWith("fetch_opds_catalog", {
      url: "https://example.com/opds",
      username: "testuser",
      password: "testpass",
      page: 1,
      page_size: 50,
    });
  });

  it("invokes fetch_opds_catalog with optional parameters omitted when null", async () => {
    const params = {
      url: "https://example.com/opds",
      username: "testuser",
      password: "testpass",
      page: null,
      page_size: null,
    };

    await opdsClient.fetchCatalog(params);

    expect(mockSafeInvoke).toHaveBeenCalledWith("fetch_opds_catalog", {
      url: "https://example.com/opds",
      username: "testuser",
      password: "testpass",
      page: undefined,
      page_size: undefined,
    });
  });

  it("passes through catalog response from Tauri", async () => {
    const mockCatalog = {
      title: "Mock OPDS Catalog",
      updated: "2024-06-15T12:00:00Z",
      authors: ["Library Author"],
      links: [{ href: "/opds", rel: "self", title: "self", type: "application/atom+xml" }],
      publications: [
        {
          id: "book-1",
          title: "Sample Book",
          authors: ["Author One"],
          identifiers: { isbn: "978-0000000001" },
          languages: ["en"],
          relations: [],
          descriptions: [],
          links: [],
        },
      ],
      pagination: { page: 1, size: 50, total: 1, next: null },
    };

    mockSafeInvoke.mockClear();
    mockSafeInvoke.mockResolvedValue(mockCatalog);

    const result = await opdsClient.fetchCatalog({
      url: "https://example.com/opds",
      username: "user",
      password: "pass",
    });

    expect(result).toEqual(mockCatalog);
    expect(mockSafeInvoke).toHaveBeenCalledTimes(1);
  });
});

describe("opdsClient.downloadPublication", () => {
  beforeEach(() => {
    mockSafeInvoke.mockResolvedValue({
      local_path: "/path/to/download.epub",
      media_type: "application/epub+zip",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes download_opds_publication with correct parameters", async () => {
    const config = {
      catalogUrl: "https://example.com/opds",
      transientUsername: "testuser",
      transientPassword: "testpass",
      contentRoot: "/content",
    };
    const publication = {
      id: "book-1",
      title: "Test Book",
      authors: ["Test Author"],
      languages: ["en"],
      relations: [],
      descriptions: ["A test book"],
      links: [
        { href: "https://example.com/download/book.epub", media_type: "application/epub+zip" },
      ],
      identifiers: {},
    };
    const format = "application/epub+zip" as const;

    await opdsClient.downloadPublication(config, publication, format);

    expect(mockSafeInvoke).toHaveBeenCalledWith("download_opds_publication", {
      catalog_url: "https://example.com/opds",
      username: "testuser",
      password: "testpass",
      publication: {
        id: "book-1",
        title: "Test Book",
        authors: ["Test Author"],
        languages: ["en"],
        relations: [],
        descriptions: ["A test book"],
        links: [
          { href: "https://example.com/download/book.epub", media_type: "application/epub+zip" },
        ],
        identifiers: {},
        updated: undefined,
        pubdate: undefined,
        series: undefined,
        providers: undefined,
        representative: undefined,
      },
      content_root: "/content",
    });
  });

  it("transforms Tauri snake_case response to camelCase", async () => {
    const config = {
      catalogUrl: "https://example.com/opds",
      transientUsername: "user",
      transientPassword: "pass",
      contentRoot: "/content",
    };
    const publication = {
      id: "book-1",
      title: "Test Book",
      authors: ["Author"],
      languages: ["en"],
      relations: [],
      descriptions: [],
      links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
      identifiers: {},
    };
    const format = "application/epub+zip" as const;

    mockSafeInvoke.mockResolvedValue({
      local_path: "/path/to/download.epub",
      media_type: "application/epub+zip",
    });

    const result = await opdsClient.downloadPublication(config, publication, format);

    expect(result).toEqual({
      localPath: "/path/to/download.epub",
      mediaType: "application/epub+zip",
    });
    expect(result).not.toHaveProperty("local_path");
    expect(result).not.toHaveProperty("media_type");
  });

  it("rejects for unsupported format types", async () => {
    const config = {
      catalogUrl: "https://example.com/opds",
      transientUsername: "user",
      transientPassword: "pass",
      contentRoot: "/content",
    };
    const publication = {
      id: "book-1",
      title: "Test Book",
      authors: ["Author"],
      languages: ["en"],
      relations: [],
      descriptions: [],
      links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
      identifiers: {},
    };

    await expect(
      opdsClient.downloadPublication(config, publication, "unsupported-type" as MediaType),
    ).rejects.toThrow("Unsupported acquisition format");
  });

  it("rejects when no matching acquisition link found", async () => {
    const config = {
      catalogUrl: "https://example.com/opds",
      transientUsername: "user",
      transientPassword: "pass",
      contentRoot: "/content",
    };
    const publication = {
      id: "book-1",
      title: "Test Book",
      authors: ["Author"],
      languages: ["en"],
      relations: [],
      descriptions: [],
      links: [{ href: "https://example.com/book.pdf", media_type: "application/pdf" }],
      identifiers: {},
    };

    await expect(
      opdsClient.downloadPublication(config, publication, "application/epub+zip" as MediaType),
    ).rejects.toThrow("No acquisition link found for format");
  });

  it("does not store credentials in return value", async () => {
    const config = {
      catalogUrl: "https://example.com/opds",
      transientUsername: "secret_user",
      transientPassword: "secret_password",
      contentRoot: "/content",
    };
    const publication = {
      id: "book-1",
      title: "Test Book",
      authors: ["Author"],
      languages: ["en"],
      relations: [],
      descriptions: [],
      links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
      identifiers: {},
    };

    mockSafeInvoke.mockResolvedValue({
      local_path: "/path/book.epub",
      media_type: "application/epub+zip",
    });

    const result = await opdsClient.downloadPublication(
      config,
      publication,
      "application/epub+zip",
    );

    expect(result).not.toHaveProperty("username");
    expect(result).not.toHaveProperty("password");
    expect(result).toEqual({
      localPath: "/path/book.epub",
      mediaType: "application/epub+zip",
    });
  });
});

describe("opdsClient.getAvailableFormats", () => {
  it("returns EPUB and PDF formats from publication links", () => {
    const publication = {
      id: "book-1",
      title: "Test Book",
      authors: ["Author"],
      languages: ["en"],
      relations: [],
      descriptions: [],
      links: [
        { href: "/book.epub", media_type: "application/epub+zip" },
        { href: "/book.pdf", media_type: "application/pdf" },
      ],
      identifiers: {},
    };

    const formats = opdsClient.getAvailableFormats(publication);

    expect(formats).toHaveLength(2);
    expect(formats).toContainEqual({
      href: "/book.epub",
      mediaType: "application/epub+zip",
    });
    expect(formats).toContainEqual({
      href: "/book.pdf",
      mediaType: "application/pdf",
    });
  });

  it("returns empty array when no acquisition links", () => {
    const publication = {
      id: "book-1",
      title: "Test Book",
      authors: [],
      languages: ["en"],
      relations: [],
      descriptions: [],
      links: [{ href: "/book.html", media_type: "text/html" }],
      identifiers: {},
    };

    const formats = opdsClient.getAvailableFormats(publication);

    expect(formats).toEqual([]);
  });

  it("filters out unsupported media types", () => {
    const publication = {
      id: "book-1",
      title: "Test Book",
      authors: [],
      languages: ["en"],
      relations: [],
      descriptions: [],
      links: [
        { href: "/book.epub", media_type: "application/epub+zip" },
        { href: "/book.mobi", media_type: "application/x-mobipocket-ebook" },
        { href: "/book.pdf", media_type: "application/pdf" },
      ],
      identifiers: {},
    };

    const formats = opdsClient.getAvailableFormats(publication);

    expect(formats).toHaveLength(2);
    expect(formats).not.toContainEqual({
      href: "/book.mobi",
      mediaType: "application/x-mobipocket-ebook",
    });
  });
});

describe("opdsClient.getPreferredFormat", () => {
  it("returns the matching format", () => {
    const publication = {
      id: "book-1",
      title: "Test Book",
      authors: [],
      languages: ["en"],
      relations: [],
      descriptions: [],
      links: [
        { href: "/book.epub", media_type: "application/epub+zip" },
        { href: "/book.pdf", media_type: "application/pdf" },
      ],
      identifiers: {},
    };

    const result = opdsClient.getPreferredFormat(publication, "application/pdf");

    expect(result).toEqual({
      href: "/book.pdf",
      mediaType: "application/pdf",
    });
  });

  it("returns null when format not available", () => {
    const publication = {
      id: "book-1",
      title: "Test Book",
      authors: [],
      languages: ["en"],
      relations: [],
      descriptions: [],
      links: [{ href: "/book.epub", media_type: "application/epub+zip" }],
      identifiers: {},
    };

    const result = opdsClient.getPreferredFormat(publication, "application/pdf");

    expect(result).toBeNull();
  });
});

describe("opdsClient.onDownloadProgress (non-Tauri)", () => {
  beforeEach(() => {
    vi.mocked(tauri.isTauri).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a no-op cleanup function in browser", () => {
    const cleanup = opdsClient.onDownloadProgress("pub-1", vi.fn());

    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();
  });
});
