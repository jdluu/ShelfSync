import { create } from "zustand";
import { useStorageStore } from "@/store/storageStore";
import { safeStoreLoad } from "@/utils/tauri";

const STORE_PATH = "shelfsync_settings.json";

interface LibraryState {
  eInkMode: boolean;

  setEInkMode: (enabled: boolean) => Promise<void>;
  loadSettings: () => Promise<void>;
}

/**
 * App-level settings store. Legacy Calibre library state was removed with
 * the P2P sync product; only the e-ink display preference remains here.
 */
export const useLibraryStore = create<LibraryState>((set) => ({
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

  loadSettings: async () => {
    try {
      const store = await safeStoreLoad(STORE_PATH);
      const offPath = await store.get<string>("offline_storage_path");
      const eInk = await store.get<boolean>("e_ink_mode");

      useStorageStore.setState({
        offlineStoragePath: offPath || "",
      });
      set({ eInkMode: !!eInk });
      if (eInk) {
        document.documentElement.classList.add("e-ink");
      }
    } catch (_) {
      // Settings load failure is non-fatal; defaults apply.
    }
  },
}));
