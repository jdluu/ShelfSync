import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineLibraryClient } from "@/services/offlineLibrary";
import type { OfflineLibrarySnapshot } from "@/types/offline";
import * as tauri from "@/utils/tauri";

vi.mock("@/utils/tauri", () => ({
  safeInvoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));

const mockSafeInvoke = vi.mocked(tauri.safeInvoke);

const emptySnapshot: OfflineLibrarySnapshot = {
  complete: [],
  downloading: [],
  failed: [],
  unavailable: [],
  superseded: [],
};

describe("offlineLibraryClient", () => {
  beforeEach(() => {
    mockSafeInvoke.mockReset();
    mockSafeInvoke.mockResolvedValue(emptySnapshot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("list invokes list_offline_library without arguments", async () => {
    await offlineLibraryClient.list();

    expect(mockSafeInvoke).toHaveBeenCalledWith("list_offline_library");
  });

  it("refresh invokes refresh_offline_library with snake_case parameters", async () => {
    mockSafeInvoke.mockResolvedValue({
      added: ["book-2"],
      changed: [],
      removed: ["book-1"],
      publications_seen: 2,
      pages_visited: 1,
      truncated: false,
    });

    const report = await offlineLibraryClient.refresh({
      catalogUrl: "https://example.com/opds",
      username: "alice",
      password: "secret",
    });

    expect(mockSafeInvoke).toHaveBeenCalledWith("refresh_offline_library", {
      catalog_url: "https://example.com/opds",
      username: "alice",
      password: "secret",
      provider: undefined,
    });
    expect(report.added).toEqual(["book-2"]);
    expect(report.removed).toEqual(["book-1"]);
  });

  it("deleteContent invokes delete_offline_content with revision_id", async () => {
    mockSafeInvoke.mockResolvedValue({ revision_id: 7, deleted_file: true });

    const result = await offlineLibraryClient.deleteContent(7);

    expect(mockSafeInvoke).toHaveBeenCalledWith("delete_offline_content", {
      revision_id: 7,
    });
    expect(result).toEqual({ revision_id: 7, deleted_file: true });
  });

  it("checkDiskSpace invokes check_download_space with required_bytes", async () => {
    mockSafeInvoke.mockResolvedValue({
      available_bytes: 1024,
      required_bytes: 512,
      sufficient: true,
    });

    const status = await offlineLibraryClient.checkDiskSpace(512);

    expect(mockSafeInvoke).toHaveBeenCalledWith("check_download_space", {
      required_bytes: 512,
    });
    expect(status.sufficient).toBe(true);
  });
});

describe("buildPublicationLibraryInfo", () => {
  const baseRecord = {
    publication_id: 1,
    account_id: 1,
    provider: "grimmory",
    canonical_id: "book-1",
    metadata_json: "{}",
    publication_available: true,
    acquisition_id: 1,
    media_type: "application/epub+zip",
    canonical_url: "https://example.com/download/book-1.epub",
    local_relative_path: null,
    revision_id: 10,
    is_current_revision: true,
    expected_length: null,
    job_state: "completed" as const,
    job_error: null as string | null,
    updated_at: 0,
  };

  it("groups records by canonical id and prioritizes activity over completion", async () => {
    const { buildPublicationLibraryInfo } = await import("@/types/offline");

    const info = buildPublicationLibraryInfo({
      complete: [{ ...baseRecord, revision_id: 5 }],
      downloading: [
        {
          ...baseRecord,
          revision_id: 9,
          is_current_revision: true,
          job_state: "running",
        },
      ],
      failed: [],
      unavailable: [],
      superseded: [],
    });

    const entry = info["book-1"];
    expect(entry).toBeDefined();
    expect(entry.primary?.section).toBe("downloading");
    expect(entry.primary?.revision_id).toBe(9);
  });

  it("keeps superseded copies separate from the primary record", async () => {
    const { buildPublicationLibraryInfo } = await import("@/types/offline");

    const info = buildPublicationLibraryInfo({
      complete: [{ ...baseRecord, is_current_revision: true }],
      downloading: [],
      failed: [],
      unavailable: [],
      superseded: [{ ...baseRecord, revision_id: 3, is_current_revision: false }],
    });

    const entry = info["book-1"];
    expect(entry.primary?.section).toBe("complete");
    expect(entry.superseded).toHaveLength(1);
    expect(entry.superseded[0]?.revision_id).toBe(3);
  });

  it("returns unavailable state for server removed records", async () => {
    const { buildPublicationLibraryInfo } = await import("@/types/offline");

    const info = buildPublicationLibraryInfo({
      complete: [],
      downloading: [],
      failed: [],
      unavailable: [
        {
          ...baseRecord,
          publication_available: false,
          local_relative_path: "book-1.epub",
        },
      ],
      superseded: [],
    });

    expect(info["book-1"]?.primary?.section).toBe("unavailable");
    expect(info["book-1"]?.primary?.local_relative_path).toBe("book-1.epub");
  });
});
