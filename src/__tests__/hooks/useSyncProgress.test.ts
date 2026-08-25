import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncProgress } from "@/hooks/useSyncProgress";
import { saveBook as saveLocalBook } from "@/services/localDb";
import { useSyncStore } from "@/store/syncStore";
import type { SyncProgress } from "@/types/library";

const mocks = vi.hoisted(() => ({
  listenHandler: null as ((event: { payload: SyncProgress }) => Promise<void>) | null,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (_event: string, handler: (e: { payload: SyncProgress }) => Promise<void>) => {
      mocks.listenHandler = handler;
      return () => {};
    },
  ),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: vi.fn(async () => "/appdata"),
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(async () => false),
  sendNotification: vi.fn(),
}));

vi.mock("@/services/localDb", () => ({
  saveBook: vi.fn(),
  getLocalBooks: vi.fn(async () => []),
}));

type BooksRef = Parameters<typeof useSyncProgress>[0];

const makeEvent = (overrides: Partial<SyncProgress> & { book_id: number }): SyncProgress => ({
  title: `Book ${overrides.book_id}`,
  status: "downloading",
  progress: 0.5,
  queue_position: 0,
  queue_total: 2,
  batch_current: overrides.book_id,
  batch_total: 2,
  path: `Author/Book ${overrides.book_id}/file.epub`,
  ...overrides,
});

describe("useSyncProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSyncStore.setState({ syncProgress: {}, manualError: null });
    mocks.listenHandler = null;
  });

  const setup = (books: BooksRef["current"] = [], onSyncComplete?: (b: unknown[]) => void) =>
    renderHook(() =>
      useSyncProgress({ current: books } as BooksRef, "/store", onSyncComplete ?? vi.fn()),
    );

  const pump = async (payload: SyncProgress) => {
    await act(async () => {
      await mocks.listenHandler?.({ payload });
    });
  };

  it("subscribes to sync-progress events", async () => {
    setup();
    await waitFor(() => expect(mocks.listenHandler).not.toBeNull());
  });

  it("mirrors progress events into the sync store", async () => {
    setup();
    await waitFor(() => expect(mocks.listenHandler).not.toBeNull());

    await pump(makeEvent({ book_id: 1 }));
    await pump(makeEvent({ book_id: 2, progress: 0.9 }));

    const progress = useSyncStore.getState().syncProgress;
    expect(progress[1]).toMatchObject({ status: "downloading", progress: 0.5 });
    expect(progress[2]).toMatchObject({ status: "downloading", progress: 0.9 });
  });

  it("overwrites the entry for the same book on subsequent events", async () => {
    setup();
    await waitFor(() => expect(mocks.listenHandler).not.toBeNull());

    await pump(makeEvent({ book_id: 1, progress: 0.25 }));
    await pump(makeEvent({ book_id: 1, progress: 0.75 }));

    expect(useSyncStore.getState().syncProgress[1]?.progress).toBe(0.75);
    expect(Object.keys(useSyncStore.getState().syncProgress)).toHaveLength(1);
  });

  it("saves the book locally and finalizes the batch on completion", async () => {
    const onSyncComplete = vi.fn();
    const book = { id: 7, title: "Book 7", authors: "A", path: "p.epub" };
    setup([book] as BooksRef["current"], onSyncComplete);
    await waitFor(() => expect(mocks.listenHandler).not.toBeNull());

    await pump(makeEvent({ book_id: 7 }));
    await pump(makeEvent({ book_id: 7, status: "completed", progress: 1 }));

    expect(saveLocalBook).toHaveBeenCalledWith(book, "/store/Author/Book 7/file.epub");
    await waitFor(() => expect(onSyncComplete).toHaveBeenCalled());
    // Store keeps the last known per-book state after the batch resets
    expect(useSyncStore.getState().syncProgress[7]?.status).toBe("completed");
  });
});
