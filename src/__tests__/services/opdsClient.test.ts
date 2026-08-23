import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { opdsClient } from "@/services/opdsClient";
import * as tauri from "@/utils/tauri";

describe("opdsClient.fetchCatalog", () => {
  beforeEach(() => {
    vi.spyOn(tauri, "safeInvoke").mockResolvedValue({
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

    expect(tauri.safeInvoke).toHaveBeenCalledWith("fetch_opds_catalog", {
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

    expect(tauri.safeInvoke).toHaveBeenCalledWith("fetch_opds_catalog", {
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

    const invokeSpy = vi.spyOn(tauri, "safeInvoke").mockResolvedValue(mockCatalog);

    const result = await opdsClient.fetchCatalog({
      url: "https://example.com/opds",
      username: "user",
      password: "pass",
    });

    expect(result).toEqual(mockCatalog);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
  });
});
