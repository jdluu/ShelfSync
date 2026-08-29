import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type UseOpdsScreenOrchestrationParams,
  useOpdsScreenOrchestration,
} from "@/features/opds/useOpdsScreenOrchestration";
import { savedCatalogsService } from "@/services/savedCatalogs";
import type { Publication } from "@/types/opds";
import { notifyOpdsError } from "@/utils/notifyOpdsError";

vi.mock("@/services/savedCatalogs", () => ({
  savedCatalogsService: {
    save: vi.fn(),
  },
}));

vi.mock("@/utils/notifyOpdsError", () => ({
  notifyOpdsError: vi.fn(),
}));

const mockNotify = vi.mocked(notifyOpdsError);

const makePublication = (id: string): Publication => ({
  id,
  title: "Dune",
  authors: [],
  languages: ["en"],
  categories: [],
  relations: [],
  descriptions: [],
  identifiers: {},
  links: [],
});

describe("useOpdsScreenOrchestration", () => {
  let connection: UseOpdsScreenOrchestrationParams["connection"];
  let downloads: UseOpdsScreenOrchestrationParams["downloads"];

  beforeEach(() => {
    connection = {
      url: "https://example.com/opds",
      username: "alice",
      disconnect: vi.fn(),
    };
    downloads = {
      clearDownloads: vi.fn(),
    };
    vi.clearAllMocks();
  });

  const render = () =>
    renderHook((props: UseOpdsScreenOrchestrationParams) => useOpdsScreenOrchestration(props), {
      initialProps: { connection, downloads },
    });

  describe("disconnect orchestration", () => {
    it("disconnects the connection and clears the download registry", () => {
      const { result } = render();

      act(() => {
        result.current.handleDisconnect();
      });

      expect(connection.disconnect).toHaveBeenCalledTimes(1);
      expect(downloads.clearDownloads).toHaveBeenCalledTimes(1);
    });
  });

  describe("save-catalog orchestration", () => {
    it("persists the catalog with a non-empty fallback name and bumps the refresh key", async () => {
      vi.mocked(savedCatalogsService.save).mockResolvedValue({
        id: "cat-1",
        name: "https://example.com/opds",
        url: "https://example.com/opds",
        username: "alice",
        added_at: "2026-08-28T00:00:00Z",
      });
      const { result } = render();
      expect(result.current.savedCatalogsKey).toBe(0);

      await act(async () => {
        await result.current.handleSaveCatalog();
      });

      expect(savedCatalogsService.save).toHaveBeenCalledWith(
        "https://example.com/opds",
        connection.url,
        connection.username,
      );
      expect(result.current.savedCatalogsKey).toBe(1);
    });

    it("uses 'Untitled catalog' when the url trims to empty", async () => {
      vi.mocked(savedCatalogsService.save).mockResolvedValue({
        id: "cat-2",
        name: "Untitled catalog",
        url: "",
        username: connection.username,
        added_at: "2026-08-28T00:00:00Z",
      });
      const { result } = renderHook(
        (props: UseOpdsScreenOrchestrationParams) => useOpdsScreenOrchestration(props),
        {
          initialProps: {
            connection: { ...connection, url: "   " },
            downloads,
          },
        },
      );

      await act(async () => {
        await result.current.handleSaveCatalog();
      });

      expect(savedCatalogsService.save).toHaveBeenCalledWith(
        "Untitled catalog",
        "   ",
        connection.username,
      );
    });

    it("is best-effort: swallows a save failure without bumping the refresh key and surfaces it via notifyOpdsError", async () => {
      vi.mocked(savedCatalogsService.save).mockRejectedValue(new Error("backend down"));
      const { result } = render();

      await expect(result.current.handleSaveCatalog()).resolves.toBeUndefined();
      expect(result.current.savedCatalogsKey).toBe(0);
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ message: "backend down" }),
        { context: "Save catalog", fallback: "Failed to save the catalog" },
      );
    });

    it("does not toast when the save succeeds", async () => {
      vi.mocked(savedCatalogsService.save).mockResolvedValue({
        id: "cat-ok",
        name: "https://example.com/opds",
        url: "https://example.com/opds",
        username: "alice",
        added_at: "2026-08-28T00:00:00Z",
      });
      const { result } = render();

      await act(async () => {
        await result.current.handleSaveCatalog();
      });

      expect(result.current.savedCatalogsKey).toBe(1);
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });

  describe("detail publication state", () => {
    it("opens and closes the detail modal on the selected publication", () => {
      const { result } = render();
      expect(result.current.detailPublication).toBeNull();
      const pub = makePublication("pub-detail");

      act(() => {
        result.current.openDetail(pub);
      });
      expect(result.current.detailPublication).toBe(pub);

      act(() => {
        result.current.closeDetail();
      });
      expect(result.current.detailPublication).toBeNull();
    });
  });
});
