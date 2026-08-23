import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientToolbar } from "@/features/client/ClientToolbar";
import type { SyncBatchSummary } from "@/store/syncStore";
import type { GroupByOption } from "@/features/client/useBookFilters";

const baseProps = {
  refresh: vi.fn(),
  loading: false,
  selectionMode: false,
  toggleSelectionMode: vi.fn(),
  viewMode: "grid" as const,
  setViewMode: vi.fn(),
  searchTerm: "",
  setSearchTerm: vi.fn(),
  sortOption: "title" as const,
  setSortOption: vi.fn(),
  bookCount: 10,
  showScrollTop: false,
  groupBy: "none" as GroupByOption,
  setGroupBy: vi.fn(),
};

describe("ClientToolbar", () => {
  afterEach(cleanup);

  it("shows a compact X/Y sync indicator while a batch is active", () => {
    const syncSummary: SyncBatchSummary = {
      done: 2,
      failed: 0,
      total: 5,
      active: true,
    };
    render(<ClientToolbar {...baseProps} syncSummary={syncSummary} />);
    expect(screen.getByText("2/5")).toBeDefined();
    expect(
      screen.getByLabelText("Syncing: 2 of 5 books synced"),
    ).toBeDefined();
  });

  it("hides the sync indicator when no batch is active", () => {
    render(<ClientToolbar {...baseProps} />);
    expect(screen.queryByText("2/5")).toBeNull();
  });

  it("hides the sync indicator once the batch settles", () => {
    const syncSummary: SyncBatchSummary = {
      done: 5,
      failed: 0,
      total: 5,
      active: false,
    };
    render(<ClientToolbar {...baseProps} syncSummary={syncSummary} />);
    expect(screen.queryByText("5/5")).toBeNull();
  });
});
