import { create } from "zustand";
import { httpClient } from "@/services/apiClient";
import type { Host } from "@/types/core";
import { notifyError, notifyInfo, notifySuccess } from "@/utils/notifications";
import { safeStoreLoad } from "@/utils/tauri";

const STORE_PATH = "shelfsync_settings.json";

interface AuthState {
  connectedHost: Host | null;
  authTokens: Record<string, string>;
  pairingHost: Host | null;
  authRequired: boolean;
  isConnecting: boolean;

  setConnectedHost: (host: Host | null) => void;
  setAuthTokens: (tokens: Record<string, string>) => void;
  setPairingHost: (host: Host | null) => void;
  setAuthRequired: (required: boolean) => void;

  pair: (pin: string) => Promise<void>;
  connect: (host: Host) => void;
  testConnection: (host: Host) => Promise<boolean>;
  disconnect: () => void;
  loadTokens: () => Promise<void>;
  saveTokens: (tokens: Record<string, string>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  connectedHost: null,
  authTokens: {},
  pairingHost: null,
  authRequired: false,
  isConnecting: false,

  setConnectedHost: (host) => set({ connectedHost: host }),
  setAuthTokens: (tokens) => set({ authTokens: tokens }),
  setPairingHost: (host) => set({ pairingHost: host }),
  setAuthRequired: (required) => set({ authRequired: required }),

  pair: async (pin) => {
    const { pairingHost, authTokens, saveTokens } = get();
    if (!pairingHost) throw new Error("No host to pair with");
    const newToken = await httpClient.checkPin(pairingHost, pin);
    const hostKey = `${pairingHost.ip}:${pairingHost.port}`;
    await saveTokens({ ...authTokens, [hostKey]: newToken });
    set({ authRequired: false, pairingHost: null });
  },

  connect: (host) => set({ connectedHost: host }),

  testConnection: async (host) => {
    set({ isConnecting: true });
    notifyInfo("Connecting...", `Attempting to reach host at ${host.ip}:${host.port}`);

    try {
      const { hostname, is_library_configured } = await httpClient.ping(host);
      set({ isConnecting: false });

      if (!is_library_configured) {
        notifyError(
          "Host Not Ready",
          `Connected to ${hostname}, but no library is configured on that device yet.`,
        );
        return false;
      }

      notifySuccess("Connected!", `Successfully reached ${hostname}`);
      return true;
    } catch (_e) {
      set({ isConnecting: false });
      notifyError(
        "Connection Failed",
        `Unable to reach host at ${host.ip}:${host.port}. Make sure the host is running and firewalls are open.`,
      );
      return false;
    }
  },

  disconnect: () => set({ connectedHost: null, authRequired: false, pairingHost: null }),

  loadTokens: async () => {
    try {
      const store = await safeStoreLoad(STORE_PATH);
      const tokens = await store.get<Record<string, string>>("auth_tokens");
      if (tokens) set({ authTokens: tokens });
    } catch (_) {
      notifyError("Auth Error", "Failed to load saved authentication tokens.");
    }
  },

  saveTokens: async (tokens) => {
    try {
      const store = await safeStoreLoad(STORE_PATH);
      await store.set("auth_tokens", tokens);
      await store.save();
      set({ authTokens: tokens });
    } catch (_) {
      notifyError("Auth Error", "Failed to save authentication tokens.");
    }
  },
}));
