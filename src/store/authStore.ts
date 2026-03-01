import { create } from "zustand";
import { httpClient } from "@/services/apiClient";
import type { Host } from "@/types/core";
import { notifyError } from "@/utils/notifications";
import { safeStoreLoad } from "@/utils/tauri";

const STORE_PATH = "shelfsync_settings.json";

interface AuthState {
  connectedHost: Host | null;
  authTokens: Record<string, string>;
  pairingHost: Host | null;
  authRequired: boolean;

  setConnectedHost: (host: Host | null) => void;
  setAuthTokens: (tokens: Record<string, string>) => void;
  setPairingHost: (host: Host | null) => void;
  setAuthRequired: (required: boolean) => void;

  pair: (pin: string) => Promise<void>;
  connect: (host: Host) => void;
  disconnect: () => void;
  loadTokens: () => Promise<void>;
  saveTokens: (tokens: Record<string, string>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  connectedHost: null,
  authTokens: {},
  pairingHost: null,
  authRequired: false,

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
