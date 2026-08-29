import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfflineLibraryState } from "@/features/opds/useOfflineLibraryState";
import { offlineLibraryClient } from "@/services/offlineLibrary";
import type {
  CategorizedLibraryRecord,
  OfflineLibrarySnapshot,
  OfflineRefreshReport,
} from "@/types/offline";
import { notifyOpdsError } from "@/utils/notifyOpdsError";

vi.mock("@/services/offlineLibrary", () => ({
  offlineLibraryClient: {
    list: vi.fn(),
    refresh: vi.fn(),
    deleteContent: vi.fn(),
    checkDiskSpace: vi.fn(),
  },
  isTauriLibraryAvailable: vi.fn(() => true),
}));

vi.mock("@/utils/tauri", () => ({
  isTauri: vi.fn(() => true),
  safeInvoke: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/notifyOpdsError", () => ({
  formatOpdsErrorMessage: vi.fn((error: unknown, fallback = "Unknown error") =>
    error instanceof Error && error.message ? error.message : fallback,
  ),
  notifyOpdsError: vi.fn(),
}));

const mockList = vi.mocked(offlineLibraryClient.list);
const mockRefresh = vi.mocked(offlineLibraryClient.refresh);
const mockDeleteContent = vi.mocked(offlineLibraryClient.deleteContent);
const mockNotify = vi.mocked(notifyOpdsError);

const CATALOG_URL = "https://example.com/opds";

const refreshReport: OfflineRefreshReport = {
  added: [],
  changed: [],
  removed: [],
  publications_seen: 1,
  pages_visited: 1,
  truncated: false,
};

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
  revision_id: 11,
  is_current_revision: true,
  local_relative_path: "Dune.epub",
  expected_length: null,
  job_state: "completed" as const,
  job_error: null,
  updated_at: 0,
};

const snapshot: OfflineLibrarySnapshot = {
  complete: [baseRecord],
  downloading: [],
  failed: [],
  unavailable: [],
  superseded: [],
};

const record: CategorizedLibraryRecord = { ...baseRecord, section: "complete" };

function renderOfflineState() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return renderHook(
    () =>
      useOfflineLibraryState({
        connected: true,
        catalogUrl: CATALOG_URL,
        username: "alice",
        password: "secret",
      }),
    { wrapper },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue(snapshot);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOfflineLibraryState", () => {
  describe("handleRefreshLibrary", () => {
    it("returns null and surfaces the failure through notifyOpdsError on error", async () => {
      mockRefresh.mockRejectedValue(new Error("Catalog unreachable"));

      const { result } = renderOfflineState();
      await waitFor(() => {
        expect(mockList).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        const report = await result.current.handleRefreshLibrary();
        expect(report).toBeNull();
      });

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Catalog unreachable" }),
        { context: "Catalog refresh", fallback: "Failed to refresh the offline library" },
      );
    });

    it("returns the report and does not toast when refresh succeeds", async () => {
      mockRefresh.mockResolvedValue(refreshReport);

      const { result } = renderOfflineState();
      await waitFor(() => {
        expect(mockList).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        const report = await result.current.handleRefreshLibrary();
        expect(report).toEqual(refreshReport);
      });

      expect(mockNotify).not.toHaveBeenCalled();
      expect(mockList).toHaveBeenCalledTimes(2);
    });
  });

  describe("handleDeleteLocal", () => {
    it("surfaces the failure through notifyOpdsError and keeps the record visible", async () => {
      mockDeleteContent.mockRejectedValue(new Error("Permission denied"));

      const { result } = renderOfflineState();
      await waitFor(() => {
        expect(mockList).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        await result.current.handleDeleteLocal("book-1", record);
      });

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Permission denied" }),
        { context: "Offline library", fallback: "Failed to delete the local copy" },
      );
      expect(mockList).toHaveBeenCalledTimes(1);
      expect(result.current.libraryInfoByPublicationId["book-1"]?.primary?.revision_id).toBe(11);
    });

    it("does not toast when deletion succeeds", async () => {
      mockDeleteContent.mockResolvedValue({ revision_id: 11, deleted_file: true });

      const { result } = renderOfflineState();
      await waitFor(() => {
        expect(mockList).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        await result.current.handleDeleteLocal("book-1", record);
      });

      expect(mockNotify).not.toHaveBeenCalled();
      expect(mockList).toHaveBeenCalledTimes(2);
    });
  });
});
