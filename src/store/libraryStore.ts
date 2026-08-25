import { create } from "zustand";
import { httpClient } from "@/services/apiClient";
import { deleteBook, initDB, updateReadStatus } from "@/services/localDb";
import { useStorageStore } from "@/store/storageStore";
import { useToastStore } from "@/store/toastStore";
import type { Book, Host } from "@/types/core";
import { notifyError } from "@/utils/notifications";
import { safeStoreLoad } from "@/utils/tauri";

const STORE_PATH = "shelfsync_settings.json";

interface LibraryState {
  localBooks: Book[];
  eInkMode: boolean;

  setLocalBooks: (books: Book[]) => void;
  setEInkMode: (enabled: boolean) => Promise<void>;

  loadSettings: () => Promise<void>;
  toggleReadStatus: (book: Book, connectedHost?: Host | null, token?: string) => Promise<void>;
  deleteLocalBook: (book: Book) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  localBooks: [],
  eInkMode: false,

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
      useStorageStore.setState({
        libraryPath: libPath || "",
        offlineStoragePath: offPath || "",
      });
      set({ eInkMode: !!eInk });
      if (eInk) {
        document.documentElement.classList.add("e-ink");
      }
    } catch (_) {
      notifyError("Settings Error", "Failed to load library settings.");
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
