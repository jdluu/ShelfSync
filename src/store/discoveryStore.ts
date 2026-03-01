import { create } from "zustand";
import { api } from "@/services/apiClient";
import type { ConnectionInfo, Host } from "@/types/core";
import { isTauri, safeStoreLoad } from "@/utils/tauri";

interface DiscoveryState {
  hosts: Host[];
  knownHosts: Host[];
  myConnectionInfo: ConnectionInfo | null;
  scanning: boolean;
}

interface DiscoveryActions {
  /** Fetches the current device's connection info (IP, port, hostname). */
  refreshConnectionInfo: () => Promise<void>;
  /** Triggers a network scan for available hosts via mDNS. */
  scan: () => Promise<void>;
  /** Merges newly discovered hosts into the persisted known hosts list. */
  updateKnownHosts: (newHosts: Host[]) => Promise<void>;
  /** Initializes the store: loads persisted hosts, starts scanning, and listens for events. */
  init: () => () => void;
}

/**
 * Zustand store for network discovery state.
 *
 * Manages active/known hosts, connection info, and scanning state.
 * The `init()` action should be called once at app startup.
 * It returns a cleanup function for the Tauri event listener.
 */
export const useDiscoveryStore = create<DiscoveryState & DiscoveryActions>((set, get) => ({
  hosts: [],
  knownHosts: [],
  myConnectionInfo: null,
  scanning: false,

  refreshConnectionInfo: async () => {
    try {
      const info = await api.network.getConnectionInfo();
      set({ myConnectionInfo: info });
    } catch (error) {
      console.error("Failed to get connection info:", error);
    }
  },

  scan: async () => {
    set({ scanning: true, hosts: [] });
    try {
      await api.network.refreshDiscovery();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const results = await api.network.discoverHosts();
      set({ hosts: results });
      get().updateKnownHosts(results);
    } catch (e) {
      console.error("Discovery error:", e);
    } finally {
      set({ scanning: false });
    }
  },

  updateKnownHosts: async (newHosts: Host[]) => {
    try {
      const store = await safeStoreLoad("shelfsync_settings.json");
      const current = (await store.get<Host[]>("known_hosts")) || [];
      const merged = [...current];

      let changed = false;
      for (const h of newHosts) {
        if (!merged.find((m) => m.ip === h.ip)) {
          merged.push(h);
          changed = true;
        }
      }

      if (changed) {
        set({ knownHosts: merged });
        await store.set("known_hosts", merged);
        await store.save();
      }
    } catch (e) {
      console.error("Failed to update known hosts", e);
    }
  },

  init: () => {
    const { refreshConnectionInfo, scan } = get();
    refreshConnectionInfo();
    scan();

    const loadInitial = async () => {
      try {
        const store = await safeStoreLoad("shelfsync_settings.json");
        const saved = await store.get<Host[]>("known_hosts");
        if (saved) set({ knownHosts: saved });
      } catch (e) {
        console.error("Failed to load known hosts", e);
      }
    };
    loadInitial();

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen<Host[]>("discovery-update", (event) => {
          set({ hosts: event.payload });
          get().updateKnownHosts(event.payload);
        }).then((u) => {
          unlisten = u;
        });
      });
    }

    return () => {
      if (unlisten) unlisten();
    };
  },
}));
