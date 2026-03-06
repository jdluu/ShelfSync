import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";

/**
 * Utility to detect if the application is running within a Tauri webview.
 */
export const isTauri = (): boolean => {
  return Boolean(
    typeof window !== "undefined" &&
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined,
  );
};

/**
 * Detects if the app is running on a mobile platform (Android or iOS).
 */
export const isMobile = (): boolean => {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

/**
 * Safely calls a Tauri invoke command.
 * Returns the defaultValue if not running in Tauri.
 */
export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
  defaultValue?: T,
): Promise<T> {
  if (isTauri()) {
    return invoke<T>(command, args);
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  throw new Error(`Tauri invoke "${command}" called outside of Tauri environment.`);
}

/**
 * Safely loads a Tauri store.
 * Returns a mock store if not running in Tauri.
 */
interface Store {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown) => Promise<void>;
  save: () => Promise<void>;
  clear: () => Promise<void>;
  onKeyChange: (key: string, callback: (value: unknown) => void) => () => void;
  onChange: (callback: (key: string, value: unknown) => void) => () => void;
}

export async function safeStoreLoad(path: string): Promise<Store> {
  if (isTauri()) {
    return load(path) as unknown as Store;
  }

  // Mock store implementation for browser
  return {
    get: async <T>(key: string): Promise<T | null> => {
      const val = localStorage.getItem(`mock_store_${path}_${key}`);
      return val ? (JSON.parse(val) as T) : null;
    },
    set: async (key: string, value: unknown) => {
      localStorage.setItem(`mock_store_${path}_${key}`, JSON.stringify(value));
    },
    save: async () => {},
    clear: async () => {
      const prefix = `mock_store_${path}_`;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          localStorage.removeItem(key);
        }
      }
    },
    onKeyChange: () => () => {},
    onChange: () => () => {},
  };
}
