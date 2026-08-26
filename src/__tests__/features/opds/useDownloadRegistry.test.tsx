import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type UseDownloadRegistryParams,
  useDownloadRegistry,
} from "@/features/opds/useDownloadRegistry";
import type { DownloadConfig, DownloadResult, MediaType, Publication } from "@/types/opds";

const config: DownloadConfig = {
  catalogUrl: "https://example.com/opds",
  transientUsername: "alice",
  transientPassword: "secret",
  contentRoot: "/library",
};

const EPUB = "application/epub+zip";

const makePublication = (id: string): Publication => ({
  id,
  title: "Dune",
  authors: [],
  languages: ["en"],
  categories: [],
  relations: [],
  descriptions: [],
  identifiers: {},
  links: [{ href: `/books/${id}.epub`, media_type: EPUB }],
});

describe("useDownloadRegistry", () => {
  let startDownload: ReturnType<
    typeof vi.fn<
      (config: DownloadConfig, publication: Publication, format: MediaType) => Promise<void>
    >
  >;
  let onSettled: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    startDownload = vi.fn(async () => {});
    onSettled = vi.fn(async () => {});
  });

  const baseParams = (
    overrides?: Partial<UseDownloadRegistryParams>,
  ): UseDownloadRegistryParams => ({
    status: "idle",
    error: null,
    localPath: null,
    mediaType: null,
    progress: null,
    startDownload,
    onSettled,
    ...overrides,
  });

  describe("happy path", () => {
    it("tracks status/path per publication id and resolves the caller's promise", async () => {
      const { result, rerender } = renderHook(
        (props: UseDownloadRegistryParams) => useDownloadRegistry(props),
        { initialProps: baseParams() },
      );

      let promise!: Promise<DownloadResult>;
      act(() => {
        promise = result.current.handleDownload(config, makePublication("pub-happy"), EPUB);
      });
      await waitFor(() => {
        expect(startDownload).toHaveBeenCalledWith(config, expect.anything(), EPUB);
      });

      rerender(baseParams({ status: "downloading" }));
      await waitFor(() => {
        expect(result.current.downloadStatuses["pub-happy"]).toBe("downloading");
      });

      rerender(
        baseParams({
          status: "completed",
          localPath: "/library/pub-happy.epub",
          mediaType: EPUB,
        }),
      );

      await expect(promise).resolves.toEqual({
        localPath: "/library/pub-happy.epub",
        mediaType: EPUB,
      });
      expect(result.current.downloadStatuses["pub-happy"]).toBe("completed");
      expect(result.current.downloadLocalPaths["pub-happy"]).toBe("/library/pub-happy.epub");
      expect(result.current.downloadErrors["pub-happy"]).toBeNull();
      expect(onSettled).toHaveBeenCalled();
    });
  });

  describe("error path", () => {
    it("records the failure keyed by publication and resolves with an empty path", async () => {
      const { result, rerender } = renderHook(
        (props: UseDownloadRegistryParams) => useDownloadRegistry(props),
        { initialProps: baseParams() },
      );

      let promise!: Promise<DownloadResult>;
      act(() => {
        promise = result.current.handleDownload(config, makePublication("pub-fail"), EPUB);
      });

      rerender(baseParams({ status: "failed", error: "Hash verification failed" }));

      await expect(promise).resolves.toEqual({ localPath: "", mediaType: EPUB });
      expect(result.current.downloadStatuses["pub-fail"]).toBe("failed");
      expect(result.current.downloadErrors["pub-fail"]).toBe("Hash verification failed");
      expect(onSettled).toHaveBeenCalled();
    });
  });

  describe("progress", () => {
    it("stores clamped per-publication percentages and null when size unknown", async () => {
      const { result, rerender } = renderHook(
        (props: UseDownloadRegistryParams) => useDownloadRegistry(props),
        { initialProps: baseParams() },
      );

      act(() => {
        void result.current.handleDownload(config, makePublication("pub-prog"), EPUB);
      });

      rerender(
        baseParams({
          progress: {
            publicationId: "pub-prog",
            bytesReceived: 50,
            totalBytes: 200,
            status: "downloading",
          },
        }),
      );
      await waitFor(() => {
        expect(result.current.downloadProgressPercents["pub-prog"]).toBe(25);
      });

      rerender(
        baseParams({
          progress: {
            publicationId: "pub-prog",
            bytesReceived: 400,
            totalBytes: 200,
            status: "downloading",
          },
        }),
      );
      await waitFor(() => {
        expect(result.current.downloadProgressPercents["pub-prog"]).toBe(100);
      });

      rerender(
        baseParams({
          progress: {
            publicationId: "pub-prog",
            bytesReceived: 10,
            totalBytes: null,
            status: "downloading",
          },
        }),
      );
      await waitFor(() => {
        expect(result.current.downloadProgressPercents["pub-prog"]).toBeNull();
      });
    });
  });

  describe("race/cancel", () => {
    it("only resolves the latest download and ignores stale progress from the superseded one", async () => {
      const { result, rerender } = renderHook(
        (props: UseDownloadRegistryParams) => useDownloadRegistry(props),
        { initialProps: baseParams() },
      );

      let firstPromise!: Promise<DownloadResult>;
      act(() => {
        firstPromise = result.current.handleDownload(config, makePublication("pub-a"), EPUB);
      });

      let secondPromise!: Promise<DownloadResult>;
      act(() => {
        secondPromise = result.current.handleDownload(config, makePublication("pub-b"), EPUB);
      });

      rerender(baseParams({ status: "downloading" }));
      await waitFor(() => {
        expect(result.current.downloadStatuses["pub-b"]).toBe("downloading");
      });

      act(() => {
        rerender(
          baseParams({
            status: "downloading",
            progress: {
              publicationId: "pub-a",
              bytesReceived: 99,
              totalBytes: 100,
              status: "downloading",
            },
          }),
        );
      });
      expect(result.current.downloadProgressPercents["pub-a"]).toBeUndefined();

      act(() => {
        rerender(
          baseParams({
            status: "completed",
            localPath: "/library/pub-b.epub",
            mediaType: EPUB,
            progress: {
              publicationId: "pub-b",
              bytesReceived: 1,
              totalBytes: 2,
              status: "downloading",
            },
          }),
        );
      });

      await expect(secondPromise).resolves.toEqual({
        localPath: "/library/pub-b.epub",
        mediaType: EPUB,
      });

      await act(async () => {});
      let firstResolved = false;
      void firstPromise.then(() => {
        firstResolved = true;
      });
      await act(async () => {});
      expect(firstResolved).toBe(false);

      expect(result.current.downloadStatuses["pub-a"]).toBeUndefined();
      expect(result.current.downloadErrors["pub-a"]).toBeUndefined();
    });

    it("clears every map mid-flight when disconnecting", async () => {
      const { result, rerender } = renderHook(
        (props: UseDownloadRegistryParams) => useDownloadRegistry(props),
        { initialProps: baseParams() },
      );

      act(() => {
        void result.current.handleDownload(config, makePublication("pub-cancel"), EPUB);
      });
      rerender(baseParams({ status: "downloading" }));
      await waitFor(() => {
        expect(result.current.downloadStatuses["pub-cancel"]).toBe("downloading");
      });

      act(() => {
        result.current.clearDownloads();
      });

      expect(result.current.downloadStatuses).toEqual({});
      expect(result.current.downloadErrors).toEqual({});
      expect(result.current.downloadLocalPaths).toEqual({});
      expect(result.current.downloadProgressPercents).toEqual({});
    });
  });
});
