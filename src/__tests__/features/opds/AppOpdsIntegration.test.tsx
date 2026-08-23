import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import App from "@/App";
import { RoleSelection } from "@/features/role-selection/RoleSelection";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { useDiscoveryStore } from "@/store/discoveryStore";
import { useLibraryStore } from "@/store/libraryStore";

vi.mock("@/features/opds/OpdsCatalogScreenContainer", () => ({
  default: () => <div data-testid="mock-opds-container">Mocked OPDS Container</div>,
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/store/libraryStore", () => ({
  useLibraryStore: vi.fn(),
}));

vi.mock("@/store/discoveryStore", () => ({
  useDiscoveryStore: vi.fn(),
}));

vi.mock("@/hooks/useUpdater", () => ({
  useUpdater: () => ({ checkForUpdates: vi.fn() }),
}));

async function renderAppPastInitialization(): Promise<void> {
  render(<App />);
  await waitFor(
    () => {
      expect(screen.getByText("Choose Your Role")).toBeDefined();
    },
    { timeout: 3000 },
  );
}

describe("OPDS app shell integration", () => {
  afterEach(cleanup);

  beforeEach(() => {
    useAppStore.setState({ role: "unselected" });

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
      appMode: "unselected",
      eInkMode: false,
      offlineStoragePath: null,
      selectOfflineStorageFolder: vi.fn(),
      setEInkMode: vi.fn(),
      setAppMode: vi.fn().mockResolvedValue(undefined),
      loadSettings: vi.fn().mockResolvedValue(undefined),
    };
    (useLibraryStore as unknown as Mock).mockImplementation(
      (selector?: (state: typeof libraryState) => unknown) =>
        (selector ? selector(libraryState) : libraryState) as unknown,
    );

    const authState = {
      authRequired: false,
      pairingHost: null,
      pair: vi.fn(),
      disconnect: vi.fn(),
      loadTokens: vi.fn().mockResolvedValue(undefined),
    };
    (useAuthStore as unknown as Mock).mockReturnValue(authState);

    const discoveryState = {
      myConnectionInfo: null,
      init: vi.fn(() => () => {}),
    };
    (useDiscoveryStore as unknown as Mock).mockImplementation(
      (selector?: (state: typeof discoveryState) => unknown) =>
        (selector ? selector(discoveryState) : discoveryState) as unknown,
    );
  });

  it("renders the OPDS catalog container when Browse Catalog is selected", async () => {
    await renderAppPastInitialization();

    expect(screen.queryByTestId("mock-opds-container")).toBeNull();

    fireEvent.click(screen.getByText("Browse Catalog (OPDS)"));

    expect(await screen.findByTestId("mock-opds-container")).toBeDefined();
    expect(screen.getByRole("button", { name: "Back" })).toBeDefined();
    expect(screen.queryByText("Choose Your Role")).toBeNull();
  });

  it("returns to role selection when the back button is clicked", async () => {
    await renderAppPastInitialization();

    fireEvent.click(screen.getByText("Browse Catalog (OPDS)"));
    await screen.findByTestId("mock-opds-container");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => {
      expect(screen.getByText("Choose Your Role")).toBeDefined();
    });
    expect(screen.queryByTestId("mock-opds-container")).toBeNull();
  });
});

describe("RoleSelection OPDS option", () => {
  afterEach(cleanup);

  it("renders two options when no browse-catalog callback is provided", () => {
    render(<RoleSelection onSelect={vi.fn()} />);

    expect(screen.getByText("Host Mode")).toBeDefined();
    expect(screen.getByText("Client Mode")).toBeDefined();
    expect(screen.queryByText("Browse Catalog (OPDS)")).toBeNull();
  });

  it("renders three options when a browse-catalog callback is provided", () => {
    render(<RoleSelection onSelect={vi.fn()} onBrowseCatalog={vi.fn()} />);

    expect(screen.getByText("Host Mode")).toBeDefined();
    expect(screen.getByText("Client Mode")).toBeDefined();
    expect(screen.getByText("Browse Catalog (OPDS)")).toBeDefined();
  });

  it("invokes onBrowseCatalog when the Browse Catalog option is clicked", () => {
    const onBrowseCatalog = vi.fn();
    render(<RoleSelection onSelect={vi.fn()} onBrowseCatalog={onBrowseCatalog} />);

    fireEvent.click(screen.getByText("Browse Catalog (OPDS)"));

    expect(onBrowseCatalog).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing onSelect behavior working alongside the new option", () => {
    const onSelect = vi.fn();
    render(<RoleSelection onSelect={onSelect} onBrowseCatalog={vi.fn()} />);

    fireEvent.click(screen.getByText("Host Mode"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("host");

    fireEvent.click(screen.getByText("Client Mode"));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith("client");
  });
});
