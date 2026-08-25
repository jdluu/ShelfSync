import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { ClientDashboard } from "@/features/client/ClientDashboard";
import { useHostManifest, useInfiniteHostManifest } from "@/hooks/useLibraryQuery";
import { useLibraryStore } from "@/store/libraryStore";
import { useSyncStore } from "@/store/syncStore";

// Mock localStorage and matchMedia for ThemeSwitcher
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
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock("@/store/libraryStore", () => ({
  useLibraryStore: vi.fn(),
}));

vi.mock("@/store/syncStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/syncStore")>();
  return { ...actual, useSyncStore: vi.fn() };
});

vi.mock("@/hooks/useLibraryQuery", () => ({
  useHostManifest: vi.fn(),
  useInfiniteHostManifest: vi.fn(),
}));

vi.mock("@/hooks/useSyncProgress", () => ({
  useSyncProgress: vi.fn(),
}));

describe("ClientDashboard Integration", () => {
  afterEach(cleanup);

  beforeEach(() => {
    (useLibraryStore as unknown as Mock).mockReturnValue({
      appMode: "client",
      offlineStoragePath: "/test/path",
      localBooks: [],
      toggleReadStatus: vi.fn(),
      setLocalBooks: vi.fn(),
    });

    (useSyncStore as unknown as Mock).mockReturnValue({
      syncProgress: {},
      manualError: null,
      clearError: vi.fn(),
      syncBooks: vi.fn(),
    });

    (useHostManifest as unknown as Mock).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    (useInfiniteHostManifest as unknown as Mock).mockReturnValue({
      data: { pages: [{ books: [], totalCount: 0, version: "1.0.0" }], pageParams: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: true,
      isFetchingNextPage: false,
    });
  });

  it("shows an empty state when no host is connected", () => {
    render(<ClientDashboard onChangeRole={vi.fn()} />);
    expect(screen.getByText("No host connected")).toBeDefined();
    expect(screen.getByText("Client Dashboard")).toBeDefined();
  });

  it("renders the explore tab with no remote books available", () => {
    render(<ClientDashboard onChangeRole={vi.fn()} />);
    expect(screen.getByText("Explore")).toBeDefined();
  });
});
