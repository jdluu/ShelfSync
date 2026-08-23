import { invoke } from "@tauri-apps/api/core";
import { dirname } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { httpClient } from "@/services/apiClient";
import { deleteBook, getLocalBooks, initDB, updateReadStatus } from "@/services/localDb";
import { useToastStore } from "@/store/toastStore";
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
  eInkMode: boolean;
  /** Mobile-only: the two-option "where should downloads go?" choice is on screen. */
  storageChoiceOpen: boolean;

  setAppMode: (mode: AppMode) => Promise<void>;
  setLibraryPath: (path: string) => Promise<void>;
  setOfflineStoragePath: (path: string) => Promise<void>;
  setLocalBooks: (books: Book[]) => void;
  setEInkMode: (enabled: boolean) => Promise<void>;

  loadSettings: () => Promise<void>;
  selectLibraryFolder: () => Promise<void>;
  selectOfflineStorageFolder: () => Promise<void>;
  /** Mobile option 1: use the platform-recommended location from the backend. */
  chooseRecommendedStorage: () => Promise<void>;
  /** Mobile option 2 (advanced): pick a folder via the device file browser fallback. */
  browseForStorage: () => Promise<void>;
  dismissStorageChoice: () => void;
  toggleReadStatus: (book: Book, connectedHost?: Host | null, token?: string) => Promise<void>;
  deleteLocalBook: (book: Book) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  appMode: "unselected",
  libraryPath: "",
  offlineStoragePath: "",
  localBooks: [],
  eInkMode: false,
  storageChoiceOpen: false,

  setEInkMode: async (enabled) => {
    set({ eInkMode: enabled });
    if (enabled) {
      document.documentElement.classList.add("e-ink");
    } else {
      document.documentElement.classList.remove("e-ink");
    }
    try {
      const store = await safeStoreLoad(STORE_PATH);
      await store.set("e_ink_mode", enabled);
      await store.save();
    } catch (_) {}
  },

  setAppMode: async (mode) => {
    set({ appMode: mode });
    if (isTauri()) {
      try {
        await invoke("set_hosting_mode", { enabled: mode === "host" });
        await invoke("set_auto_sync", { enabled: mode === "client" });
      } catch (e) {
        console.error("Failed to set app mode configurations:", e);
      }
    }
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
      const [libPath, offPath, eInk] = await Promise.all([
        store.get<string>("library_path"),
        store.get<string>("offline_storage_path"),
        store.get<boolean>("e_ink_mode"),
      ]);
      set({
        libraryPath: libPath || "",
        offlineStoragePath: offPath || "",
        eInkMode: !!eInk,
      });
      if (eInk) {
        document.documentElement.classList.add("e-ink");
      }
    } catch (_) {
      notifyError("Settings Error", "Failed to load library settings.");
    }
  },

  selectLibraryFolder: async () => {
    if (!isTauri()) throw new Error("Only available in desktop app");

    const toast = useToastStore.getState();

    try {
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

    const toast = useToastStore.getState();

    // Mobile has no native directory chooser in Tauri v2, so present an
    // explicit choice instead of silently falling back to a placeholder file.
    if (isMobile()) {
      set({ storageChoiceOpen: true });
      return;
    }

    try {
      let selected: string | string[] | null = null;

      try {
        selected = await open({
          directory: true,
          multiple: false,
          title: "Select Offline Storage Folder",
        });
      } catch (e) {
        console.warn("[Storage] Standard folder picker failed:", e);
      }

      if (selected && typeof selected === "string") {
        await get().setOfflineStoragePath(selected);
        toast.addToast(`Storage location updated: ${selected}`, "success");
      }
    } catch (error) {
      toast.addToast("Failed to select folder.", "error");
      console.error(error);
    }
  },

  chooseRecommendedStorage: async () => {
    const toast = useToastStore.getState();

    try {
      const defaultPath = await invoke<string>("get_default_storage_path");
      if (!defaultPath) {
        toast.addToast("No recommended location is available on this device.", "error");
        return;
      }
      await get().setOfflineStoragePath(defaultPath);
      set({ storageChoiceOpen: false });
      toast.addToast(`Downloads will be saved to ${defaultPath}`, "success");
    } catch (_) {
      toast.addToast("Couldn't get the recommended location. Try browsing instead.", "error");
    }
  },

  browseForStorage: async () => {
    const toast = useToastStore.getState();

    try {
      // Android has no native folder picker in Tauri v2. The device file
      // browser opens with a placeholder file; confirming it in a folder
      // selects that folder.
      toast.addToast(
        "In your file browser, confirm the suggested file inside the folder you want to use.",
        "info",
      );

      const selected = await save({
        defaultPath: "SHELF_SYNC_TARGET.txt",
        title: "Pick Storage Location",
      });

      if (!selected) return; // Cancelled — keep the choice open.

      const folder = await dirname(selected);
      if (!folder) return;

      await get().setOfflineStoragePath(folder);
      set({ storageChoiceOpen: false });
      toast.addToast(`Downloads will be saved to ${folder}`, "success");
    } catch (_) {
      toast.addToast("Couldn't browse for a folder.", "error");
    }
  },

  dismissStorageChoice: () => set({ storageChoiceOpen: false }),

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
        await httpClient.updateProgress(connectedHost, token, book.remote_id || book.id, next);
      }
    } catch (_) {
      notifyError("Sync Error", "Failed to update reading status.");
    }
  },

  deleteLocalBook: async (book) => {
    try {
      await deleteBook(book.id);
      set((state) => ({
        localBooks: state.localBooks.filter((b) => b.id !== book.id),
      }));
      useToastStore.getState().addToast(`"${book.title}" removed from device.`, "success");
    } catch (_) {
      notifyError("Delete Error", "Failed to delete book from device.");
    }
  },
}));
