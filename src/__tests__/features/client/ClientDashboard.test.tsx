import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscovery } from "@/contexts/DiscoveryContext";
import { ClientDashboard } from "@/features/client/ClientDashboard";

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

vi.mock("@/contexts/LibraryContext", () => ({
  useLibrary: () => ({
    syncProgress: {},
    syncBooks: vi.fn(),
  }),
}));

vi.mock("@/contexts/DiscoveryContext", () => ({
  useDiscovery: vi.fn(),
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
  });

  it("shows discovery view when no host is connected", () => {
    render(
      <ClientDashboard
        books={[]}
        localBooks={[]}
        loading={false}
        error={null}
        connectedHost={null}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSync={vi.fn()}
        onOpenBook={vi.fn()}
        onToggleStatus={vi.fn()}
        onChangeRole={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mock-discover")).toBeDefined();
    expect(screen.getByText("Not Connected")).toBeDefined();
  });

  it("calls onConnect when discovery view triggers connect", () => {
    const handleConnect = vi.fn();
    render(
      <ClientDashboard
        books={[]}
        localBooks={[]}
        loading={false}
        error={null}
        connectedHost={null}
        onConnect={handleConnect}
        onDisconnect={vi.fn()}
        onSync={vi.fn()}
        onOpenBook={vi.fn()}
        onToggleStatus={vi.fn()}
        onChangeRole={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("mock-discover"));
    expect(handleConnect).toHaveBeenCalledWith({ ip: "127.0.0.1", port: 1420 });
  });

  it("shows library view when a host is connected", () => {
    render(
      <ClientDashboard
        books={[]}
        localBooks={[]}
        loading={false}
        error={null}
        connectedHost={{ ip: "10.0.0.5", port: 1420, hostname: "Desktop" }}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSync={vi.fn()}
        onOpenBook={vi.fn()}
        onToggleStatus={vi.fn()}
        onChangeRole={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Live Sync").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("mock-discover")).toBeNull();
  });
});
