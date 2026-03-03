import { create } from "zustand";
import { getLocalBooks, initDB, updateReadStatus } from "@/services/localDb";
import type { Book, Host } from "@/types/core";
import type { AppMode } from "@/types/library";
import { notifyError } from "@/utils/notifications";
import { isMobile, isTauri, safeStoreLoad } from "@/utils/tauri";

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
  deleteLocalBook: (book: Book) => Promise<void>;
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

    const { useToastStore } = await import("@/store/toastStore");
    const toast = useToastStore.getState();

    try {
      const { open, save } = await import("@tauri-apps/plugin-dialog");
      const { dirname } = await import("@tauri-apps/api/path");

      // Try standard folder picker first
      let selected: string | string[] | null = null;
      try {
        selected = await open({
          directory: true,
          multiple: false,
          title: "Select Calibre Library Folder",
        });
      } catch (e) {
        console.warn("[Library] Standard folder picker failed, trying save hack:", e);
      }

      // HACK: Mobile fallback for directory selection
      if (!selected && isMobile()) {
        toast.addToast("Pick a location by confirming a placeholder filename.", "info");
        selected = await save({
          defaultPath: "CALIBRE_LIBRARY_TARGET.txt",
          title: "Pick Library Location",
        });

        if (selected && typeof selected === "string") {
          selected = await dirname(selected);
        }
      }

      if (selected && typeof selected === "string") {
        await get().setLibraryPath(selected);
        toast.addToast("Library location updated!", "success");
      }
    } catch (error) {
      if (isMobile()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const defaultPath = await invoke<string>("get_default_storage_path");
        if (defaultPath) {
          await get().setLibraryPath(defaultPath);
          toast.addToast("Using recommended system storage for library.", "info");
        }
      } else {
        toast.addToast("Failed to select library folder.", "error");
        console.error(error);
      }
    }
  },

  selectOfflineStorageFolder: async () => {
    if (!isTauri()) throw new Error("Only available in desktop app");

    const { useToastStore } = await import("@/store/toastStore");
    const toast = useToastStore.getState();

    try {
      const { open, save } = await import("@tauri-apps/plugin-dialog");
      const { dirname } = await import("@tauri-apps/api/path");

      // Try the standard folder picker first
      let selected: string | string[] | null = null;
      
      try {
        selected = await open({
          directory: true,
          multiple: false,
          title: "Select Offline Storage Folder",
        });
      } catch (e) {
        console.warn("[Storage] Standard folder picker failed, trying save hack:", e);
      }

      // HACK: If open didn't return anything or threw, try the save dialog hack for mobile
      if (!selected && isMobile()) {
        toast.addToast("Pick a location by confirming a placeholder filename.", "info");

        selected = await save({
          defaultPath: "SHELF_SYNC_TARGET.txt",
          title: "Pick Storage Location",
        });

        if (selected && typeof selected === "string") {
          // Strip the dummy filename to get the directory
          selected = await dirname(selected);
        }
      }

      if (selected && typeof selected === "string") {
        await get().setOfflineStoragePath(selected);
        toast.addToast("Storage location updated!", "success");
      }
    } catch (error) {
      if (String(error).includes("not implemented on mobile") || isMobile()) {
        // Ultimate Fallback: Get default path from Rust
        const { invoke } = await import("@tauri-apps/api/core");
        const defaultPath = await invoke<string>("get_default_storage_path");
        if (defaultPath) {
          await get().setOfflineStoragePath(defaultPath);
          toast.addToast("Using recommended system storage.", "info");
        }
      } else {
        toast.addToast("Failed to select folder.", "error");
        console.error(error);
      }
    }
  },

  toggleReadStatus: async (book, connectedHost, token) => {
    // ... (existing implementation)
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

  deleteLocalBook: async (book) => {
    try {
      const { deleteBook } = await import("@/services/localDb");
      await deleteBook(book.id);
      set((state) => ({
        localBooks: state.localBooks.filter((b) => b.id !== book.id),
      }));
      const { useToastStore } = await import("@/store/toastStore");
      useToastStore.getState().addToast(`"${book.title}" removed from device.`, "success");
    } catch (_) {
      notifyError("Delete Error", "Failed to delete book from device.");
    }
  },
}));
