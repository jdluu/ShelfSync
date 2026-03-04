import { create } from "zustand";
import { useToastStore } from "@/store/toastStore";
import type { Book, Host } from "@/types/core";
import type { SyncProgress } from "@/types/library";
import { notifyError } from "@/utils/notifications";
import { isTauri, safeInvoke } from "@/utils/tauri";
import { appDataDir } from "@tauri-apps/api/path";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";

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

      const destRoot =
        offlineStoragePath ||
        (isTauri() ? await appDataDir() : "");

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
