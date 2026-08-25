import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { useLibraryStore } from "@/store/libraryStore";

vi.mock("@/features/opds/OpdsCatalogScreenContainer", () => ({
  default: () => <div data-testid="mock-opds-container">Mocked OPDS Container</div>,
}));

vi.mock("@/store/libraryStore", () => ({
  useLibraryStore: vi.fn(),
}));

vi.mock("@/hooks/useUpdater", () => ({
  useUpdater: () => ({ checkForUpdates: vi.fn() }),
}));

describe("OPDS app shell integration", () => {
  afterEach(cleanup);

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      writable: true,
    });

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const libraryState = {
      eInkMode: false,
      offlineStoragePath: null,
      selectOfflineStorageFolder: vi.fn(),
      setEInkMode: vi.fn(),
      loadSettings: vi.fn().mockResolvedValue(undefined),
    };
    (useLibraryStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (state: typeof libraryState) => unknown) =>
        (selector ? selector(libraryState) : libraryState) as unknown,
    );
  });

  it("renders the OPDS catalog screen directly without role selection", async () => {
    render(<App />);

    expect(await screen.findByTestId("mock-opds-container")).toBeDefined();
    expect(screen.queryByText("Choose Your Role")).toBeNull();
  });
});
