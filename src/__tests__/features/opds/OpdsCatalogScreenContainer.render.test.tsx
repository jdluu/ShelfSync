import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpdsCatalogScreenContainer from "@/features/opds/OpdsCatalogScreenContainer";
import { opdsClient } from "@/services/opdsClient";
import type { Catalog, Publication } from "@/types/opds";

const tauriState = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/utils/tauri", () => ({
  isTauri: () => tauriState.enabled,
  isMobile: () => false,
  safeInvoke: vi.fn().mockResolvedValue([]),
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
  id: "pub-render-1",
  title: "Dune",
  authors: ["Frank Herbert"],
  languages: ["en"],
  categories: ["Science Fiction"],
  relations: [],
  descriptions: ["A desert planet epic."],
  identifiers: {},
  links: [{ href: "https://example.com/dune.epub", media_type: "application/epub+zip" }],
  ...overrides,
});

const createCatalog = (): Catalog => ({
  title: "Test Catalog",
  authors: [],
  links: [],
  publications: [createPublication()],
  pagination: { page: 1, size: 20, total: 40, next: `${CATALOG_URL}?page=2` },
});

function renderContainer(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const element: React.ReactElement = (
    <QueryClientProvider client={queryClient}>
      <OpdsCatalogScreenContainer />
    </QueryClientProvider>
  );
  render(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  tauriState.enabled = false;
});

afterEach(() => {
  cleanup();
});

describe("OpdsCatalogScreenContainer rendering", () => {
  it("renders the connect form before a connection exists", () => {
    renderContainer();

    expect(screen.getByLabelText("Catalog URL")).not.toBeNull();
    expect(screen.getByLabelText("Username (optional)")).not.toBeNull();
    expect(screen.getByLabelText("Password (optional)")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Connect" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
    expect(opdsClient.fetchCatalog).not.toHaveBeenCalled();
  });

  it("renders the full catalog screen identically once connected", async () => {
    vi.mocked(opdsClient.fetchCatalog).mockResolvedValue(createCatalog());
    renderContainer();

    fireEvent.change(screen.getByLabelText("Catalog URL"), { target: { value: CATALOG_URL } });
    fireEvent.change(screen.getByLabelText("Username (optional)"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText("Password (optional)"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Dune" })).not.toBeNull();
    });

    const contentRootInput = screen.getByLabelText("Content root") as HTMLInputElement;
    expect(contentRootInput.value).toBe("ShelfSync");

    // Catalog header and publication card landmarks.
    expect(screen.getByText("Test Catalog")).not.toBeNull();
    expect(screen.getByText("Frank Herbert")).not.toBeNull();

    // Download controls for the card (format tags are replaced by the
    // download section once a catalog connection provides a config).
    expect(screen.getByRole("region", { name: "Download options" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Select download format" })).not.toBeNull();

    // Pagination controls driven by catalog pagination metadata.
    expect(screen.getByRole("button", { name: "Next page" })).not.toBeNull();
    const previousButton = screen.getByRole("button", {
      name: "Previous page",
    }) as HTMLButtonElement;
    expect(previousButton.disabled).toBe(true);

    // Connection management remains available.
    expect(screen.getByRole("button", { name: "Disconnect" })).not.toBeNull();

    // No detail modal until requested.
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
