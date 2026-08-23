import { appDataDir } from "@tauri-apps/api/path";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { create } from "zustand";
import { useLibraryStore } from "@/store/libraryStore";
import { useToastStore } from "@/store/toastStore";
import type { Book, Host } from "@/types/core";
import type { SyncProgress } from "@/types/library";
import { notifyError } from "@/utils/notifications";
import { isTauri, safeInvoke } from "@/utils/tauri";

const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === "true";

export interface SyncBatchSummary {
  /** Books finished (completed or failed). */
  done: number;
  failed: number;
  total: number;
  active: boolean;
}

/**
 * Derive an "X of Y" batch summary from the per-book progress map.
 *
 * Prefers the authoritative backend batch size when present and falls back
 * to the number of tracked entries otherwise.
 */
export function deriveSyncSummary(
  progress: Record<number, SyncProgress>,
): SyncBatchSummary | null {
  const items = Object.values(progress);
  if (items.length === 0) return null;
  const batched = items.find((p) => p.batch_total > 0);
  return {
    done: items.filter((p) => p.status === "completed" || p.status === "error").length,
    failed: items.filter((p) => p.status === "error").length,
    total: batched ? batched.batch_total : items.length,
    active: items.some((p) => p.status === "downloading"),
  };
}

interface SyncState {
  syncProgress: Record<number, SyncProgress>;
  manualError: string | null;

  setSyncProgress: (progress: Record<number, SyncProgress>) => void;
  setManualError: (error: string | null) => void;
  clearError: () => void;

  syncBooks: (
    books: Book[],
    connectedHost: Host,
    token: string,
    offlineStoragePath: string,
  ) => Promise<void>;
}

export const useSyncStore = create<SyncState>((set) => ({
  syncProgress: {},
  manualError: null,

  setSyncProgress: (progress) => set({ syncProgress: progress }),
  setManualError: (error) => set({ manualError: error }),
  clearError: () => set({ manualError: null }),

  syncBooks: async (booksToSync, connectedHost, token, offlineStoragePath) => {
    try {
      // Guard: filter out books already being synced
      const currentProgress = useSyncStore.getState().syncProgress;
      const newBooks = booksToSync.filter((b) => {
        const status = currentProgress[b.id]?.status;
        return status !== "downloading" && status !== "pending";
      });

      if (newBooks.length === 0) {
        useToastStore.getState().addToast("Already syncing — please wait.", "info");
        return;
      }

      if (MOCK_MODE) {
        // Mock progress iteration
        const count = newBooks.length;
        useToastStore
          .getState()
          .addToast(`Syncing ${count} book${count !== 1 ? "s" : ""}…`, "info");

        for (const book of newBooks) {
          // Add to queue
          useSyncStore.getState().setSyncProgress({
            ...useSyncStore.getState().syncProgress,
            [book.id]: {
              book_id: book.id,
              title: book.title,
              status: "downloading",
              progress: 0,
              queue_position: 1,
              queue_total: 1,
              batch_current: newBooks.indexOf(book) + 1,
              batch_total: count,
            },
          });

          // Fake download frames
          for (let p = 10; p <= 100; p += 30) {
            await new Promise((resolve) => setTimeout(resolve, 400));
            useSyncStore.getState().setSyncProgress({
              ...useSyncStore.getState().syncProgress,
              [book.id]: {
                book_id: book.id,
                title: book.title,
                status: "downloading",
                progress: p / 100,
                queue_position: 1,
                queue_total: 1,
                batch_current: newBooks.indexOf(book) + 1,
                batch_total: count,
              },
            });
          }

          // Complete
          useSyncStore.getState().setSyncProgress({
            ...useSyncStore.getState().syncProgress,
            [book.id]: {
              book_id: book.id,
              title: book.title,
              status: "completed",
              progress: 1,
              queue_position: 1,
              queue_total: 1,
              batch_current: newBooks.indexOf(book) + 1,
              batch_total: count,
            },
          });

          // Add to local storage
          const localBooks = useLibraryStore.getState().localBooks;
          if (!localBooks.find((b: Book) => b.id === book.id)) {
            useLibraryStore
              .getState()
              .setLocalBooks([
                ...localBooks,
                { ...book, local_path: `/mock/path/${book.id}.epub` },
              ]);
          }
        }
        return;
      }

      const destRoot = offlineStoragePath || (isTauri() ? await appDataDir() : "");

      await safeInvoke("start_bulk_sync", {
        books: newBooks,
        hostIp: connectedHost.ip,
        hostPort: connectedHost.port,
        token: token,
        destinationRoot: destRoot,
      });

      const count = newBooks.length;
      useToastStore.getState().addToast(`Syncing ${count} book${count !== 1 ? "s" : ""}…`, "info");

      if (isTauri()) {
        const permission = await isPermissionGranted();
        if (!permission) await requestPermission();
      }
    } catch (_) {
      useToastStore.getState().addToast("Sync failed — check connection.", "error");
      notifyError("Sync Failed", "Failed to start synchronization.");
      set({ manualError: "Failed to start synchronization." });
    }
  },
}));
