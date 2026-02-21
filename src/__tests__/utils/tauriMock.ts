import { vi } from "vitest";

/**
 * Utility to mock Tauri IPC calls gracefully in Vitest environments.
 * It hijacks the `safeInvoke` utility and provides a mock implementation
 * or returns predefined payloads for specific commands.
 */
export function mockSafeInvoke(commandMocks: Record<string, unknown> = {}) {
  return vi.mock("@/utils/tauri", () => ({
    isTauri: () => false,
    safeInvoke: vi.fn(async (command: string, _args: unknown, defaultValue: unknown) => {
      if (command in commandMocks) {
        return commandMocks[command];
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Unhandled mock Tauri invoke for command: ${command}`);
    }),
    safeStoreLoad: vi.fn(async () => ({
      get: vi.fn(),
      set: vi.fn(),
      save: vi.fn(),
      clear: vi.fn(),
      onKeyChange: vi.fn(),
      onChange: vi.fn(),
    })),
  }));
}
