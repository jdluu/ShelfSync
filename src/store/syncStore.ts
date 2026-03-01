import { create } from "zustand";
import type { Book, Host } from "@/types/core";
import type { SyncProgress } from "@/types/library";
import { notifyError } from "@/utils/notifications";
import { isTauri, safeInvoke } from "@/utils/tauri";

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
      const destRoot =
        offlineStoragePath ||
        (isTauri() ? await (await import("@tauri-apps/api/path")).appDataDir() : "");

      await safeInvoke("start_bulk_sync", {
        books: booksToSync,
        hostIp: connectedHost.ip,
        hostPort: connectedHost.port,
        token: token,
        destinationRoot: destRoot,
      });

      if (isTauri()) {
        const { isPermissionGranted, requestPermission } = await import(
          "@tauri-apps/plugin-notification"
        );
        const permission = await isPermissionGranted();
        if (!permission) await requestPermission();
      }
    } catch (_) {
      notifyError("Sync Failed", "Failed to start synchronization.");
      set({ manualError: "Failed to start synchronization." });
    }
  },
}));
