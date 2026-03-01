import { create } from "zustand";
import { getLocalBooks, initDB, updateReadStatus } from "@/services/localDb";
import type { Book, Host } from "@/types/core";
import type { AppMode } from "@/types/library";
import { notifyError } from "@/utils/notifications";
import { isTauri, safeStoreLoad } from "@/utils/tauri";

const STORE_PATH = "shelfsync_settings.json";

interface LibraryState {
  appMode: AppMode;
  libraryPath: string;
  offlineStoragePath: string;
  localBooks: Book[];

  setAppMode: (mode: AppMode) => Promise<void>;
  setLibraryPath: (path: string) => Promise<void>;
  setOfflineStoragePath: (path: string) => Promise<void>;
  setLocalBooks: (books: Book[]) => void;

  loadSettings: () => Promise<void>;
  selectLibraryFolder: () => Promise<void>;
  selectOfflineStorageFolder: () => Promise<void>;
  toggleReadStatus: (book: Book, connectedHost?: Host | null, token?: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  appMode: "unselected",
  libraryPath: "",
  offlineStoragePath: "",
  localBooks: [],

  setAppMode: async (mode) => {
    set({ appMode: mode });
    if (mode === "client") {
      try {
        await initDB();
        const stored = await getLocalBooks();
        set({ localBooks: stored });
      } catch (_) {
        notifyError("Database Error", "Failed to initialize local database.");
      }
    }
  },

  setLibraryPath: async (path) => {
    set({ libraryPath: path });
    try {
      const store = await safeStoreLoad(STORE_PATH);
      await store.set("library_path", path);
      await store.save();
    } catch (_) {
      notifyError("Settings Error", "Failed to save library path.");
    }
  },

  setOfflineStoragePath: async (path) => {
    set({ offlineStoragePath: path });
    try {
      const store = await safeStoreLoad(STORE_PATH);
      await store.set("offline_storage_path", path);
      await store.save();
    } catch (_) {
      notifyError("Settings Error", "Failed to save offline storage path.");
    }
  },

  setLocalBooks: (books) => set({ localBooks: books }),

  loadSettings: async () => {
    try {
      await initDB();
      const store = await safeStoreLoad(STORE_PATH);
      const [libPath, offPath] = await Promise.all([
        store.get<string>("library_path"),
        store.get<string>("offline_storage_path"),
      ]);
      set({
        libraryPath: libPath || "",
        offlineStoragePath: offPath || "",
      });
    } catch (_) {
      notifyError("Settings Error", "Failed to load library settings.");
    }
  },

  selectLibraryFolder: async () => {
    if (!isTauri()) throw new Error("Only available in desktop app");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Calibre Library Folder",
    });
    if (selected && typeof selected === "string") {
      await get().setLibraryPath(selected);
    }
  },

  selectOfflineStorageFolder: async () => {
    if (!isTauri()) throw new Error("Only available in desktop app");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Offline Storage Folder",
    });
    if (selected && typeof selected === "string") {
      await get().setOfflineStoragePath(selected);
    }
  },

  toggleReadStatus: async (book, connectedHost, token) => {
    const current = book.read_status || "unread";
    let next: "unread" | "reading" | "finished" = "reading";
    if (current === "reading") next = "finished";
    if (current === "finished") next = "unread";

    try {
      await updateReadStatus(book.id, next);
      set((state) => ({
        localBooks: state.localBooks.map((b) =>
          b.id === book.id ? { ...b, read_status: next } : b,
        ),
      }));

      if (connectedHost && token) {
        const { httpClient } = await import("@/services/apiClient");
        await httpClient.updateProgress(connectedHost, token, book.remote_id || book.id, next);
      }
    } catch (_) {
      notifyError("Sync Error", "Failed to update reading status.");
    }
  },
}));
