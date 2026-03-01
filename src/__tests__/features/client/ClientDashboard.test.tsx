import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { useDiscovery } from "@/contexts/DiscoveryContext";
import { ClientDashboard } from "@/features/client/ClientDashboard";
import { useHostManifest } from "@/hooks/useLibraryQuery";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { useSyncStore } from "@/store/syncStore";

// Mock child components to isolate behavior
vi.mock("@/features/discovery/Discovery", () => ({
  Discovery: ({ onConnect }: { onConnect: (host: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onConnect({ ip: "127.0.0.1", port: 1420 })}
      data-testid="mock-discover"
    >
      Connect Host
    </button>
  ),
}));

vi.mock("@/contexts/DiscoveryContext", () => ({
  useDiscovery: vi.fn(),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/store/libraryStore", () => ({
  useLibraryStore: vi.fn(),
}));

vi.mock("@/store/syncStore", () => ({
  useSyncStore: vi.fn(),
}));

vi.mock("@/hooks/useLibraryQuery", () => ({
  useHostManifest: vi.fn(),
}));

vi.mock("@/hooks/useSyncProgress", () => ({
  useSyncProgress: vi.fn(),
}));

describe("ClientDashboard Integration", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.mocked(useDiscovery).mockReturnValue({
      scan: vi.fn(),
      hosts: [],
      knownHosts: [],
      scanning: false,
      myConnectionInfo: null,
      refreshConnectionInfo: vi.fn(),
    });

    (useAuthStore as unknown as Mock).mockReturnValue({
      connectedHost: null,
      authTokens: {},
      setAuthRequired: vi.fn(),
      setPairingHost: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    });

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
  });

  it("shows discovery view when no host is connected", () => {
    render(<ClientDashboard onChangeRole={vi.fn()} />);
    expect(screen.getByTestId("mock-discover")).toBeDefined();
    expect(screen.getByText("Not Connected")).toBeDefined();
  });

  it("calls connect when discovery view triggers connect", () => {
    const handleConnect = vi.fn();
    (useAuthStore as unknown as Mock).mockReturnValue({
      connectedHost: null,
      authTokens: {},
      setAuthRequired: vi.fn(),
      setPairingHost: vi.fn(),
      connect: handleConnect,
      disconnect: vi.fn(),
    });

    render(<ClientDashboard onChangeRole={vi.fn()} />);
    fireEvent.click(screen.getByTestId("mock-discover"));
    expect(handleConnect).toHaveBeenCalledWith({ ip: "127.0.0.1", port: 1420 });
  });

  it("shows library view when a host is connected", () => {
    (useAuthStore as unknown as Mock).mockReturnValue({
      connectedHost: { ip: "10.0.0.5", port: 1420, hostname: "Desktop" },
      authTokens: {},
      setAuthRequired: vi.fn(),
      setPairingHost: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    });

    render(<ClientDashboard onChangeRole={vi.fn()} />);
    expect(screen.getAllByText("Live Sync").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("mock-discover")).toBeNull();
  });
});
