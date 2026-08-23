import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueueOverlay } from "@/components/ui/QueueOverlay";
import type { SyncProgress } from "@/types/library";

const makeProgress = (
  overrides: Partial<SyncProgress> & { book_id: number },
): SyncProgress => ({
  title: `Book ${overrides.book_id}`,
  status: "downloading",
  progress: 0.4,
  queue_position: 0,
  queue_total: 3,
  batch_current: overrides.book_id,
  batch_total: 3,
  ...overrides,
});

describe("QueueOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing when there is no progress", () => {
    const { container } = render(<QueueOverlay progress={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders active downloads", () => {
    render(
      <QueueOverlay
        progress={{
          1: makeProgress({ book_id: 1 }),
          2: makeProgress({ book_id: 2, progress: 0.8 }),
        }}
      />,
    );
    expect(screen.getByText("Book 1")).toBeDefined();
    expect(screen.getByText("Book 2")).toBeDefined();
    expect(screen.getByText("Sync Progress")).toBeDefined();
  });

  it("caps the visible list and shows a queue overflow row", () => {
    const progress: Record<number, SyncProgress> = {};
    for (let id = 1; id <= 7; id++) {
      progress[id] = makeProgress({ book_id: id });
    }
    render(<QueueOverlay progress={progress} />);
    expect(screen.getByText("Book 1")).toBeDefined();
    expect(screen.queryByText("Book 6")).toBeNull();
    expect(screen.getByText("+ 2 more in queue")).toBeDefined();
  });

  it("hides itself after the settle grace period once nothing is downloading", () => {
    const progress = {
      1: makeProgress({ book_id: 1, status: "completed" as const, progress: 1 }),
      2: makeProgress({ book_id: 2, status: "completed" as const, progress: 1 }),
    };
    const { container } = render(<QueueOverlay progress={progress} />);
    expect(screen.getByText("Sync Progress")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.firstChild).toBeNull();

    // A fresh download brings the overlay back
    render(
      <QueueOverlay
        progress={{
          ...progress,
          3: makeProgress({ book_id: 3, status: "downloading" as const }),
        }}
      />,
    );
    expect(screen.getByText("Sync Progress")).toBeDefined();
  });
});
