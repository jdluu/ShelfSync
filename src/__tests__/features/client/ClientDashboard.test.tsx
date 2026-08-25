import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientDashboard } from "@/features/client/ClientDashboard";
import type { Book, Host } from "@/types/core";
import type { SyncProgress } from "@/types/library";

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

// The dashboard hook is fully mocked so every rendering state of the
// ClientDashboard component can be driven directly from the tests.
const dashboard = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@/features/client/useClientDashboard", () => ({
  useClientDashboard: vi.fn(() => dashboard.current),
}));

const HOST: Host = { ip: "192.168.1.10", port: 8420, hostname: "shelf-host" };

const makeBook = (overrides: Partial<Book> & Pick<Book, "id">): Book => ({
  title: `Book ${overrides.id}`,
  authors: "Test Author",
  path: `library/${overrides.id}`,
  series: null,
  formats: ["EPUB"],
  ...overrides,
});

const makeProgress = (book_id: number, overrides: Partial<SyncProgress> = {}): SyncProgress => ({
  book_id,
  title: `Book ${book_id}`,
  status: "downloading",
  progress: 0.5,
  queue_position: 0,
  queue_total: 1,
  batch_current: 1,
  batch_total: 1,
  ...overrides,
});

const createDashboardMock = (overrides: Record<string, unknown> = {}) => ({
  connectedHost: null as Host | null,
  disconnect: vi.fn(),
  books: [] as Book[],
  loading: false,
  error: null as string | null,
  clearError: vi.fn(),
  refresh: vi.fn(),
  syncBook: vi.fn(),
  openLocalBook: vi.fn(),
  handleToggleStatus: vi.fn(),
  syncProgress: {} as Record<number, SyncProgress>,
  searchTerm: "",
  setSearchTerm: vi.fn(),
  sortOption: "title",
  setSortOption: vi.fn(),
  selectionMode: false,
  setSelectionMode: vi.fn(),
  selectedIds: new Set<number>(),
  viewMode: "grid" as "grid" | "list",
  setViewMode: vi.fn(),
  showScrollTop: false,
  filteredRemoteBooks: [] as Book[],
  filteredLocalBooks: [] as Book[],
  localBooks: [] as Book[],
  toggleSelection: vi.fn(),
  selectAll: vi.fn(),
  selectNone: vi.fn(),
  startBulkSync: vi.fn(),
  startBulkDelete: vi.fn(),
  token: undefined as string | undefined,
  groupBy: "series" as const,
  setGroupBy: vi.fn(),
  groupedBooks: null,
  selectGroup: vi.fn(),
  collapsedGroups: new Set<string>(),
  toggleGroupCollapse: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: true,
  isFetchingNextPage: false,
  offlineStoragePath: "/test/path",
  selectOfflineStorageFolder: vi.fn(),
  deleteLocalBook: vi.fn(),
  activeTab: "explore" as "explore" | "library",
  setActiveTab: vi.fn(),
  ...overrides,
});

const renderDashboard = (overrides: Record<string, unknown> = {}) => {
  dashboard.current = createDashboardMock(overrides);
  return render(<ClientDashboard onChangeRole={vi.fn()} />);
};

describe("ClientDashboard Integration", () => {
  afterEach(cleanup);

  beforeEach(() => {
    dashboard.current = createDashboardMock();
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

  it("shows the skeleton grid while the host manifest is loading", () => {
    const { container } = renderDashboard({ loading: true });
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(12);
    expect(screen.queryByText("No host connected")).toBeNull();
    expect(screen.queryByText("No books found")).toBeNull();
  });

  it("renders the error banner with the message and dismisses via clearError", () => {
    renderDashboard({ error: "Failed to start synchronization." });

    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    for (const alert of alerts) {
      expect(within(alert).getByText("Failed to start synchronization.")).toBeDefined();
    }

    fireEvent.click(screen.getAllByLabelText("Dismiss error")[0]);
    const mock = dashboard.current as ReturnType<typeof createDashboardMock>;
    expect(mock.clearError).toHaveBeenCalledTimes(1);
  });

  it("prompts for a download location when none is configured", () => {
    renderDashboard({
      connectedHost: HOST,
      books: [makeBook({ id: 1 })],
      offlineStoragePath: "",
    });

    expect(screen.getByText("Set Download Location")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Select Folder" }));
    const mock = dashboard.current as ReturnType<typeof createDashboardMock>;
    expect(mock.selectOfflineStorageFolder).toHaveBeenCalledTimes(1);
  });

  it("shows the connection banner for the connected host", () => {
    renderDashboard({ connectedHost: HOST });

    expect(screen.getByText("shelf-host")).toBeDefined();
    expect(screen.getByText("192.168.1.10:8420")).toBeDefined();
    expect(screen.getByText("Connected")).toBeDefined();
  });

  it("offers a refresh when the connected host has no books", () => {
    renderDashboard({ connectedHost: HOST, books: [], groupedBooks: new Map() });
    expect(screen.queryByText("No host connected")).toBeNull();
    expect(screen.getByText("No books found")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Refresh Library" }));
    const mock = dashboard.current as ReturnType<typeof createDashboardMock>;
    expect(mock.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders a populated grid grouped by series", () => {
    const dune1 = makeBook({ id: 1, title: "Dune", authors: "Frank Herbert", series: "Dune Saga" });
    const dune2 = makeBook({
      id: 2,
      title: "Dune Messiah",
      authors: "Frank Herbert",
      series: "Dune Saga",
    });
    const standalone = makeBook({ id: 3, title: "The Wager", authors: "David Grann" });

    renderDashboard({
      connectedHost: HOST,
      books: [dune1, dune2, standalone],
      filteredRemoteBooks: [dune1, dune2, standalone],
      groupedBooks: new Map([
        ["Dune Saga", [dune1, dune2]],
        ["Standalone", [standalone]],
      ]),
    });

    expect(screen.getByRole("heading", { name: "Dune Saga" })).toBeDefined();
    expect(screen.getByText("2 items")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Standalone" })).toBeDefined();
    expect(screen.getByText("1 items")).toBeDefined();
    expect(screen.getByText("Dune Messiah")).toBeDefined();
    expect(screen.getByText("The Wager")).toBeDefined();
  });

  it("renders book cards in list view without grouping", () => {
    const book = makeBook({ id: 7, title: "Project Hail Mary", authors: "Andy Weir" });
    renderDashboard({
      connectedHost: HOST,
      books: [book],
      filteredRemoteBooks: [book],
      groupBy: "none",
      viewMode: "list",
    });

    const card = screen.getByLabelText("Project Hail Mary by Andy Weir");
    expect(card).toBeDefined();
    expect(screen.getByText("Available Books")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined(); // toolbar book count badge
  });

  it("syncs a remote book when its Sync button is clicked", () => {
    const book = makeBook({ id: 7, title: "Project Hail Mary", authors: "Andy Weir" });
    renderDashboard({
      connectedHost: HOST,
      books: [book],
      filteredRemoteBooks: [book],
      groupBy: "none",
      viewMode: "list",
    });

    const card = screen.getByLabelText("Project Hail Mary by Andy Weir");
    fireEvent.click(within(card).getByRole("button", { name: "Sync" }));
    const mock = dashboard.current as ReturnType<typeof createDashboardMock>;
    expect(mock.syncBook).toHaveBeenCalledTimes(1);
    expect(mock.syncBook).toHaveBeenCalledWith(book);
  });

  it("shows download progress on a card that is currently syncing", () => {
    const book = makeBook({ id: 7, title: "Project Hail Mary", authors: "Andy Weir" });
    renderDashboard({
      connectedHost: HOST,
      books: [book],
      filteredRemoteBooks: [book],
      groupBy: "none",
      viewMode: "list",
      syncProgress: { 7: makeProgress(7, { progress: 0.5 }) },
    });

    const card = screen.getByLabelText("Project Hail Mary by Andy Weir");
    const progress = within(card).getByRole("progressbar");
    expect(progress.getAttribute("value")).toBe("50");
  });

  it("surfaces the sync queue overlay while downloads are in flight", () => {
    renderDashboard({ syncProgress: { 9: makeProgress(9) } });
    expect(screen.getByText("Sync Progress")).toBeDefined();
    expect(screen.getByText("Book 9")).toBeDefined();
  });

  it("lists downloaded books with their count on the library tab", () => {
    const local = makeBook({
      id: 4,
      title: "Local Book",
      local_path: "/device/books/local.epub",
    });
    renderDashboard({
      activeTab: "library",
      localBooks: [local],
      filteredLocalBooks: [local],
      groupBy: "none",
      viewMode: "list",
    });

    expect(screen.getByRole("heading", { name: "My Library" })).toBeDefined();
    expect(screen.getByText("1 Items")).toBeDefined();

    const card = screen.getByLabelText("Local Book by Test Author");
    fireEvent.click(within(card).getByRole("button", { name: "Open File" }));
    const mock = dashboard.current as ReturnType<typeof createDashboardMock>;
    expect(mock.openLocalBook).toHaveBeenCalledWith("/device/books/local.epub");
  });

  it("toggles the read status from a local book card", () => {
    const local = makeBook({
      id: 4,
      title: "Local Book",
      read_status: "unread",
      local_path: "/device/books/local.epub",
    });
    renderDashboard({
      activeTab: "library",
      localBooks: [local],
      filteredLocalBooks: [local],
      groupBy: "none",
      viewMode: "list",
    });

    const card = screen.getByLabelText("Local Book by Test Author");
    fireEvent.click(within(card).getByRole("button", { name: "Mark Local Book as reading" }));
    const mock = dashboard.current as ReturnType<typeof createDashboardMock>;
    expect(mock.handleToggleStatus).toHaveBeenCalledWith(local);
  });

  it("shows the empty state and browse action when the device library is empty", () => {
    renderDashboard({ activeTab: "library" });

    expect(screen.getByText("Device library is empty")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Browse Books" }));
    const mock = dashboard.current as ReturnType<typeof createDashboardMock>;
    expect(mock.setActiveTab).toHaveBeenCalledWith("explore");
  });
});
