import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOpdsDownload } from "@/features/opds/useOpdsDownload";
import { opdsClient } from "@/services/opdsClient";
import * as tauri from "@/utils/tauri";

vi.mock("@/services/opdsClient", () => ({
  opdsClient: {
    downloadPublication: vi.fn(),
    onDownloadProgress: vi.fn(),
  },
}));

vi.mock("@/utils/tauri", () => ({
  isTauri: vi.fn(() => true),
}));

describe("useOpdsDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("returns idle status initially", () => {
      const { result } = renderHook(() => useOpdsDownload());

      expect(result.current.status).toBe("idle");
      expect(result.current.progress).toBeNull();
      expect(result.current.localPath).toBeNull();
      expect(result.current.mediaType).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("provides startDownload and cancelDownload functions", () => {
      const { result } = renderHook(() => useOpdsDownload());

      expect(typeof result.current.startDownload).toBe("function");
      expect(typeof result.current.cancelDownload).toBe("function");
    });
  });

  describe("startDownload", () => {
    it("should download and update status to completed on success", async () => {
      vi.mocked(opdsClient.downloadPublication).mockResolvedValue({
        localPath: "/path/to/book.epub",
        mediaType: "application/epub+zip",
      });
      vi.mocked(opdsClient.onDownloadProgress).mockImplementation((_pubId, cb) => {
        cb({
          publicationId: "pub-1",
          bytesReceived: 1000,
          totalBytes: 1000,
          status: "completed",
          error: undefined,
        });
        return vi.fn();
      });

      const { result } = renderHook(() => useOpdsDownload());

      const config = {
        catalogUrl: "https://example.com/opds",
        transientUsername: "user",
        transientPassword: "pass",
        contentRoot: "/content",
      };
      const publication = {
        id: "pub-1",
        title: "Test Book",
        authors: [],
        languages: ["en"],
        relations: [],
        descriptions: [],
        links: [{ href: "/book.epub", media_type: "application/epub+zip" }],
        identifiers: {},
      };

      await act(async () => {
        await result.current.startDownload(config, publication, "application/epub+zip");
      });

      await waitFor(() => {
        expect(result.current.status).toBe("completed");
      });
      expect(result.current.localPath).toBe("/path/to/book.epub");
      expect(opdsClient.downloadPublication).toHaveBeenCalledWith(
        config,
        publication,
        "application/epub+zip",
      );
    });

    it("should download and update status to failed on error", async () => {
      vi.mocked(opdsClient.downloadPublication).mockRejectedValue(new Error("Download failed"));

      const { result } = renderHook(() => useOpdsDownload());

      const config = {
        catalogUrl: "https://example.com/opds",
        transientUsername: "user",
        transientPassword: "pass",
        contentRoot: "/content",
      };
      const publication = {
        id: "pub-2",
        title: "Test Book 2",
        authors: [],
        languages: ["en"],
        relations: [],
        descriptions: [],
        links: [{ href: "/book.epub", media_type: "application/epub+zip" }],
        identifiers: {},
      };

      await act(async () => {
        await result.current.startDownload(config, publication, "application/epub+zip");
      });

      await waitFor(() => {
        expect(result.current.status).toBe("failed");
      });
      expect(result.current.error).toBe("Download failed");
    });
  });

  describe("progress filtering", () => {
    it("should only update progress for the current publication", async () => {
      vi.mocked(opdsClient.onDownloadProgress).mockImplementation(() => vi.fn());
      vi.mocked(opdsClient.downloadPublication).mockResolvedValue({
        localPath: "/path/book.epub",
        mediaType: "application/epub+zip",
      });

      const { result } = renderHook(() => useOpdsDownload());

      const config = {
        catalogUrl: "https://example.com/opds",
        transientUsername: "user",
        transientPassword: "pass",
        contentRoot: "/content",
      };
      const publication = {
        id: "pub-filter-1",
        title: "Test Book",
        authors: [],
        languages: ["en"],
        relations: [],
        descriptions: [],
        links: [{ href: "/book.epub", media_type: "application/epub+zip" }],
        identifiers: {},
      };

      await act(async () => {
        await result.current.startDownload(config, publication, "application/epub+zip");
      });

      expect(result.current.status).toBe("completed");
    });
  });

  describe("cleanup", () => {
    it("should call cleanup function on unmount", async () => {
      const mockCleanup = vi.fn();
      vi.mocked(opdsClient.onDownloadProgress).mockImplementation(() => mockCleanup);
      vi.mocked(opdsClient.downloadPublication).mockResolvedValue({
        localPath: "/path/book.epub",
        mediaType: "application/epub+zip",
      });

      const { result, unmount } = renderHook(() => useOpdsDownload());

      const config = {
        catalogUrl: "https://example.com/opds",
        transientUsername: "user",
        transientPassword: "pass",
        contentRoot: "/content",
      };
      const publication = {
        id: "pub-unmount",
        title: "Test Book",
        authors: [],
        languages: ["en"],
        relations: [],
        descriptions: [],
        links: [{ href: "/book.epub", media_type: "application/epub+zip" }],
        identifiers: {},
      };

      await act(async () => {
        await result.current.startDownload(config, publication, "application/epub+zip");
      });

      unmount();

      expect(mockCleanup).toHaveBeenCalled();
    });
  });

  describe("cancelDownload", () => {
    it("should reset state on cancel", () => {
      vi.mocked(opdsClient.downloadPublication).mockImplementation(() => new Promise(() => {}));

      const { result } = renderHook(() => useOpdsDownload());

      act(() => {
        result.current.startDownload(
          {
            catalogUrl: "https://example.com/opds",
            transientUsername: "user",
            transientPassword: "pass",
            contentRoot: "/content",
          },
          {
            id: "pub-cancel",
            title: "Test Book",
            authors: [],
            languages: ["en"],
            relations: [],
            descriptions: [],
            links: [{ href: "/book.epub", media_type: "application/epub+zip" }],
            identifiers: {},
          },
          "application/epub+zip",
        );
      });

      act(() => {
        result.current.cancelDownload();
      });

      expect(result.current.status).toBe("idle");
      expect(result.current.progress).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("non-Tauri environment", () => {
    it("should work in non-Tauri environment without errors", async () => {
      vi.mocked(tauri.isTauri).mockReturnValue(false);
      vi.mocked(opdsClient.downloadPublication).mockResolvedValue({
        localPath: "/path/book.epub",
        mediaType: "application/epub+zip",
      });

      const { result } = renderHook(() => useOpdsDownload());

      const config = {
        catalogUrl: "https://example.com/opds",
        transientUsername: "user",
        transientPassword: "pass",
        contentRoot: "/content",
      };
      const publication = {
        id: "pub-browser",
        title: "Test Book",
        authors: [],
        languages: ["en"],
        relations: [],
        descriptions: [],
        links: [{ href: "/book.epub", media_type: "application/epub+zip" }],
        identifiers: {},
      };

      await act(async () => {
        await result.current.startDownload(config, publication, "application/epub+zip");
      });

      expect(result.current.status).toBe("completed");
      expect(result.current.localPath).toBe("/path/book.epub");
    });

    it("should not register Tauri listener in non-Tauri environment", () => {
      vi.mocked(tauri.isTauri).mockReturnValue(false);

      const { result } = renderHook(() => useOpdsDownload());

      expect(result.current.status).toBe("idle");
      expect(opdsClient.onDownloadProgress).not.toHaveBeenCalled();
    });
  });

  describe("credential handling", () => {
    it("should not persist credentials in result", async () => {
      vi.mocked(opdsClient.downloadPublication).mockResolvedValue({
        localPath: "/path/book.epub",
        mediaType: "application/epub+zip",
      });

      const { result } = renderHook(() => useOpdsDownload());

      const config = {
        catalogUrl: "https://example.com/opds",
        transientUsername: "secret_user",
        transientPassword: "secret_password",
        contentRoot: "/content",
      };
      const publication = {
        id: "pub-creds",
        title: "Test Book",
        authors: [],
        languages: ["en"],
        relations: [],
        descriptions: [],
        links: [{ href: "/book.epub", media_type: "application/epub+zip" }],
        identifiers: {},
      };

      await act(async () => {
        await result.current.startDownload(config, publication, "application/epub+zip");
      });

      expect(result.current).not.toHaveProperty("username");
      expect(result.current).not.toHaveProperty("password");
      expect(result.current.localPath).toBe("/path/book.epub");
    });
  });
});
