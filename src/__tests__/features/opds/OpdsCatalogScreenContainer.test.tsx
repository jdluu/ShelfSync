import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpdsCatalogScreenContainer from "@/features/opds/OpdsCatalogScreenContainer";
import { opdsClient } from "@/services/opdsClient";
import type { Catalog, DownloadProgress, DownloadResult, Publication } from "@/types/opds";

const tauriState = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/utils/tauri", () => ({
  isTauri: () => tauriState.enabled,
  isMobile: () => false,
  safeInvoke: vi.fn(),
  safeStoreLoad: vi.fn(),
}));

vi.mock("@/services/opdsClient", () => ({
  opdsClient: {
    fetchCatalog: vi.fn(),
    downloadPublication: vi.fn(),
    onDownloadProgress: vi.fn(),
  },
}));

const CATALOG_URL = "https://example.com/opds";

const createPublication = (overrides?: Partial<Publication>): Publication => ({
  id: "pub-1",
  title: "Dune",
  authors: ["Frank Herbert"],
  languages: ["en"],
  categories: [],
  relations: [],
  descriptions: [],
  identifiers: {},
  links: [{ href: "https://example.com/dune.epub", media_type: "application/epub+zip" }],
  ...overrides,
});

const createCatalog = (overrides?: Partial<Catalog>): Catalog => ({
  title: "Test Catalog",
  authors: [],
  links: [],
  publications: [createPublication()],
  pagination: { page: 1, size: 20, total: 40, next: `${CATALOG_URL}?page=2` },
  ...overrides,
});

type RenderResult = ReturnType<typeof render> & {
  rerenderContainer: () => void;
  queryClient: QueryClient;
};

function renderContainer(): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const element: React.ReactElement = (
    <QueryClientProvider client={queryClient}>
      <OpdsCatalogScreenContainer />
    </QueryClientProvider>
  );

  const utils = render(element);
  return {
    ...utils,
    rerenderContainer: () => utils.rerender(element),
    queryClient,
  };
}

async function connectThroughForm(catalog: Catalog): Promise<void> {
  vi.mocked(opdsClient.fetchCatalog).mockResolvedValue(catalog);

  fireEvent.change(screen.getByLabelText("Catalog URL"), {
    target: { value: CATALOG_URL },
  });
  fireEvent.change(screen.getByLabelText("Username (optional)"), {
    target: { value: "alice" },
  });
  fireEvent.change(screen.getByLabelText("Password (optional)"), {
    target: { value: "secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));

  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeNull();
  });
}

async function startEpubDownload(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Select download format" }));
  fireEvent.click(screen.getByRole("option", { name: "EPUB" }));
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Download Dune as EPUB" })).not.toBeNull();
  });
  fireEvent.click(screen.getByRole("button", { name: "Download Dune as EPUB" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  tauriState.enabled = false;
});

afterEach(() => {
  cleanup();
  tauriState.enabled = false;
});

describe("OpdsCatalogScreenContainer", () => {
  describe("connect flow", () => {
    it("calls fetchCatalog with entered credentials once enabled and defaults content root to ShelfSync", async () => {
      const view = renderContainer();

      expect(opdsClient.fetchCatalog).not.toHaveBeenCalled();

      await connectThroughForm(createCatalog());

      expect(opdsClient.fetchCatalog).toHaveBeenCalledTimes(1);
      expect(vi.mocked(opdsClient.fetchCatalog).mock.calls[0]?.[0]).toEqual({
        url: CATALOG_URL,
        username: "alice",
        password: "secret",
        page: 1,
      });

      const contentRootInput = screen.getByLabelText("Content root") as HTMLInputElement;
      expect(contentRootInput.value).toBe("ShelfSync");

      await waitFor(() => {
        expect(screen.queryByText("Dune")).not.toBeNull();
      });
      expect(
        view.queryClient
          .getQueryCache()
          .find({ queryKey: ["opds", "catalog", CATALOG_URL, "page-1"] }),
      ).toBeDefined();
    });

    it("does not fetch before connecting", async () => {
      renderContainer();

      fireEvent.change(screen.getByLabelText("Catalog URL"), {
        target: { value: CATALOG_URL },
      });
      fireEvent.change(screen.getByLabelText("Username (optional)"), {
        target: { value: "alice" },
      });
      fireEvent.change(screen.getByLabelText("Password (optional)"), {
        target: { value: "secret" },
      });

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Connect" })).not.toBeNull();
      });

      expect(opdsClient.fetchCatalog).not.toHaveBeenCalled();
    });
  });

  describe("pagination", () => {
    it("refetches with the new page key on increment and decrement", async () => {
      const { queryClient } = renderContainer();

      await connectThroughForm(createCatalog());
      await waitFor(() => {
        expect(screen.queryByText("Dune")).not.toBeNull();
      });

      fireEvent.click(screen.getByRole("button", { name: "Next page" }));

      await waitFor(() => {
        expect(opdsClient.fetchCatalog).toHaveBeenCalledTimes(2);
      });
      expect(vi.mocked(opdsClient.fetchCatalog).mock.calls[1]?.[0]).toMatchObject({ page: 2 });
      const pageTwoEntry = queryClient
        .getQueryCache()
        .find({ queryKey: ["opds", "catalog", CATALOG_URL, "page-2"] });
      expect(pageTwoEntry).toBeDefined();

      await waitFor(() => {
        const previousButton = screen.getByRole("button", {
          name: "Previous page",
        }) as HTMLButtonElement;
        expect(previousButton.disabled).toBe(false);
      });
      fireEvent.click(screen.getByRole("button", { name: "Previous page" }));

      await waitFor(() => {
        expect(opdsClient.fetchCatalog).toHaveBeenCalledTimes(3);
      });
      expect(vi.mocked(opdsClient.fetchCatalog).mock.calls[2]?.[0]).toMatchObject({ page: 1 });
    });
  });

  describe("disconnect flow", () => {
    it("clears credential state, survives a rerender without leaking values or refetching", async () => {
      const { rerenderContainer } = renderContainer();

      await connectThroughForm(createCatalog());

      fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

      expect(screen.queryByRole("button", { name: "Connect" })).not.toBeNull();
      const usernameInput = screen.getByLabelText("Username (optional)") as HTMLInputElement;
      const passwordInput = screen.getByLabelText("Password (optional)") as HTMLInputElement;
      expect(usernameInput.value).toBe("");
      expect(passwordInput.value).toBe("");

      rerenderContainer();

      const usernameAfterRerender = screen.getByLabelText(
        "Username (optional)",
      ) as HTMLInputElement;
      const passwordAfterRerender = screen.getByLabelText(
        "Password (optional)",
      ) as HTMLInputElement;
      expect(usernameAfterRerender.value).toBe("");
      expect(passwordAfterRerender.value).toBe("");

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Connect" })).not.toBeNull();
      });
      expect(opdsClient.fetchCatalog).toHaveBeenCalledTimes(1);
      expect(opdsClient.downloadPublication).not.toHaveBeenCalled();
    });
  });

  describe("downloads", () => {
    it("invokes startDownload with selected format and current download config", async () => {
      const publication = createPublication({ id: "pub-download-1" });
      renderContainer();

      await connectThroughForm(createCatalog({ publications: [publication] }));
      await waitFor(() => {
        expect(screen.queryByText("Dune")).not.toBeNull();
      });

      vi.mocked(opdsClient.downloadPublication).mockResolvedValue({
        localPath: "/downloads/ShelfSync/dune.epub",
        mediaType: "application/epub+zip",
      });

      fireEvent.change(screen.getByLabelText("Content root"), {
        target: { value: "/custom-root" },
      });

      await startEpubDownload();

      await waitFor(() => {
        expect(opdsClient.downloadPublication).toHaveBeenCalledTimes(1);
      });
      expect(opdsClient.downloadPublication).toHaveBeenCalledWith(
        {
          catalogUrl: CATALOG_URL,
          transientUsername: "alice",
          transientPassword: "secret",
          contentRoot: "/custom-root",
        },
        publication,
        "application/epub+zip",
      );

      await waitFor(() => {
        expect(screen.queryByText("Download status: completed")).not.toBeNull();
      });
    });

    it("records a failed download error keyed by publication id", async () => {
      renderContainer();

      await connectThroughForm(
        createCatalog({ publications: [createPublication({ id: "pub-fail-1" })] }),
      );
      await waitFor(() => {
        expect(screen.queryByText("Dune")).not.toBeNull();
      });

      vi.mocked(opdsClient.downloadPublication).mockRejectedValue(new Error("Download failed"));

      await startEpubDownload();

      await waitFor(() => {
        expect(screen.queryByText("Download status: failed")).not.toBeNull();
      });

      const statusAlert = screen
        .getAllByRole("status")
        .find((element) => element.textContent?.includes("Download failed"));
      expect(statusAlert).toBeDefined();
      expect(statusAlert?.textContent).toContain("Download failed");
    });

    it("threads live per-publication progress percent into publication cards", async () => {
      tauriState.enabled = true;

      let progressCallback: ((progress: DownloadProgress) => void) | null = null;
      let resolveDownload: ((result: DownloadResult) => void) | null = null;

      vi.mocked(opdsClient.onDownloadProgress).mockImplementation((_publicationId, callback) => {
        progressCallback = callback;
        return () => {};
      });
      vi.mocked(opdsClient.downloadPublication).mockImplementation(
        () =>
          new Promise<DownloadResult>((resolve) => {
            resolveDownload = resolve;
          }),
      );

      const publication = createPublication({ id: "pub-progress-e2e", title: "Dune" });
      renderContainer();

      await connectThroughForm(createCatalog({ publications: [publication] }));
      await waitFor(() => {
        expect(screen.queryByText("Dune")).not.toBeNull();
      });

      await startEpubDownload();

      await waitFor(() => {
        expect(progressCallback).not.toBeNull();
      });

      await act(async () => {
        progressCallback?.({
          publicationId: "pub-progress-e2e",
          bytesReceived: 50,
          totalBytes: 200,
          status: "downloading",
        });
      });

      const progressBar = screen.getByRole("progressbar", { name: "Downloading Dune" });
      expect(progressBar.getAttribute("value")).toBe("25");
      expect(screen.getByText("25%")).not.toBeNull();

      await act(async () => {
        progressCallback?.({
          publicationId: "pub-progress-e2e",
          bytesReceived: 200,
          totalBytes: 200,
          status: "downloading",
        });
      });
      expect(screen.getByText("100%")).not.toBeNull();

      await act(async () => {
        resolveDownload?.({
          localPath: "/downloads/ShelfSync/dune.epub",
          mediaType: "application/epub+zip",
        });
      });

      await waitFor(() => {
        expect(screen.queryByText("Download status: completed")).not.toBeNull();
      });
      expect(screen.queryByRole("progressbar")).toBeNull();
    });
  });
});
