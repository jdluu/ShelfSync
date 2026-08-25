import { describe, expect, it } from "vitest";
import { deriveSyncSummary } from "@/store/syncStore";
import type { SyncProgress } from "@/types/library";

const makeProgress = (overrides: Partial<SyncProgress> & { book_id: number }): SyncProgress => ({
  title: `Book ${overrides.book_id}`,
  status: "downloading",
  progress: 0,
  queue_position: 0,
  queue_total: 0,
  batch_current: overrides.book_id,
  batch_total: 0,
  ...overrides,
});

describe("deriveSyncSummary", () => {
  it("returns null when nothing is tracked", () => {
    expect(deriveSyncSummary({})).toBeNull();
  });

  it("counts finished books and keeps activity flag", () => {
    const summary = deriveSyncSummary({
      1: makeProgress({ book_id: 1, status: "completed", batch_total: 5 }),
      2: makeProgress({ book_id: 2, status: "error", batch_total: 5 }),
      3: makeProgress({ book_id: 3, status: "downloading", batch_total: 5 }),
    });
    expect(summary).toEqual({ done: 2, failed: 1, total: 5, active: true });
  });

  it("prefers the backend batch total over tracked entries", () => {
    const summary = deriveSyncSummary({
      1: makeProgress({ book_id: 1, status: "completed", batch_total: 12 }),
    });
    expect(summary?.total).toBe(12);
    expect(summary?.done).toBe(1);
    expect(summary?.active).toBe(false);
  });

  it("falls back to the tracked count when no batch metadata exists", () => {
    const summary = deriveSyncSummary({
      1: makeProgress({ book_id: 1 }),
      2: makeProgress({ book_id: 2 }),
    });
    expect(summary?.total).toBe(2);
  });
});
