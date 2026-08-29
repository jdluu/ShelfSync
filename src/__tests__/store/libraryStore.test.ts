import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLibraryStore } from "@/store/libraryStore";
import { useStorageStore } from "@/store/storageStore";
import { notifyError } from "@/utils/notifications";
import { safeStoreLoad } from "@/utils/tauri";

const mocks = vi.hoisted(() => ({
  isTauri: true,
  storeData: new Map<string, unknown>(),
  storeLoadPaths: [] as string[],
  storeSets: [] as Array<[string, unknown]>,
  storeSaves: 0,
  failStoreLoad: false,
}));

vi.mock("@/utils/tauri", () => ({
  isTauri: vi.fn(() => mocks.isTauri),
  isMobile: vi.fn(() => false),
  safeInvoke: vi.fn(async () => undefined),
  safeStoreLoad: vi.fn(async (path: string) => {
    mocks.storeLoadPaths.push(path);
    if (mocks.failStoreLoad) throw new Error("settings store unavailable");
    return {
      get: async <T>(key: string): Promise<T | null> => (mocks.storeData.get(key) as T) ?? null,
      set: async (key: string, value: unknown) => {
        mocks.storeData.set(key, value);
        mocks.storeSets.push([key, value]);
      },
      save: async () => {
        mocks.storeSaves += 1;
      },
      clear: async () => {
        mocks.storeData.clear();
      },
      onKeyChange: () => () => {},
      onChange: () => () => {},
    };
  }),
}));

vi.mock("@/utils/notifications", () => ({
  notifyError: vi.fn(async (_title: string, _message: string) => {}),
  notifySuccess: vi.fn(async () => {}),
  notifyInfo: vi.fn(async () => {}),
}));

const eInkClasses = () => document.documentElement.classList.contains("e-ink");

describe("e-ink display setting load (#115)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTauri = true;
    mocks.storeData.clear();
    mocks.storeLoadPaths.length = 0;
    mocks.storeSets.length = 0;
    mocks.storeSaves = 0;
    mocks.failStoreLoad = false;
    useLibraryStore.setState({ eInkMode: false });
    useStorageStore.setState({ offlineStoragePath: "" });
    document.documentElement.classList.remove("e-ink");
  });

  it("applies the persisted e-ink preference and the DOM class", async () => {
    mocks.storeData.set("e_ink_mode", true);

    await useLibraryStore.getState().loadSettings();

    expect(useLibraryStore.getState().eInkMode).toBe(true);
    expect(eInkClasses()).toBe(true);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("leaves e-ink off when the preference is not persisted", async () => {
    mocks.storeData.set("e_ink_mode", false);

    await useLibraryStore.getState().loadSettings();

    expect(useLibraryStore.getState().eInkMode).toBe(false);
    expect(eInkClasses()).toBe(false);
  });

  it("routes a load failure through notifyError and keeps defaults", async () => {
    mocks.failStoreLoad = true;
    useLibraryStore.setState({ eInkMode: true });
    document.documentElement.classList.add("e-ink");

    await expect(useLibraryStore.getState().loadSettings()).resolves.toBeUndefined();

    expect(notifyError).toHaveBeenCalledWith(
      "Settings Error",
      "Failed to load e-ink display settings.",
    );
    // Defaults still apply: the optimistic e-ink value is not introduced.
    expect(useLibraryStore.getState().eInkMode).toBe(true);
    expect(eInkClasses()).toBe(true);
  });
});

describe("e-ink display setting save (#115)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTauri = true;
    mocks.storeData.clear();
    mocks.storeLoadPaths.length = 0;
    mocks.storeSets.length = 0;
    mocks.storeSaves = 0;
    mocks.failStoreLoad = false;
    useLibraryStore.setState({ eInkMode: false });
    useStorageStore.setState({ offlineStoragePath: "" });
    document.documentElement.classList.remove("e-ink");
  });

  it("updates state and DOM optimistically before persisting", async () => {
    await useLibraryStore.getState().setEInkMode(true);

    expect(useLibraryStore.getState().eInkMode).toBe(true);
    expect(eInkClasses()).toBe(true);
    expect(vi.mocked(safeStoreLoad)).toHaveBeenCalledWith("shelfsync_settings.json");
    expect(mocks.storeSets).toContainEqual(["e_ink_mode", true]);
    expect(mocks.storeSaves).toBeGreaterThan(0);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("turns off the DOM class when e-ink is disabled", async () => {
    document.documentElement.classList.add("e-ink");
    useLibraryStore.setState({ eInkMode: true });

    await useLibraryStore.getState().setEInkMode(false);

    expect(useLibraryStore.getState().eInkMode).toBe(false);
    expect(eInkClasses()).toBe(false);
  });

  it("routes a save failure through notifyError while keeping optimistic state", async () => {
    mocks.failStoreLoad = true;

    await expect(useLibraryStore.getState().setEInkMode(true)).resolves.toBeUndefined();

    expect(useLibraryStore.getState().eInkMode).toBe(true);
    expect(eInkClasses()).toBe(true);
    expect(notifyError).toHaveBeenCalledWith(
      "Settings Error",
      "Failed to save e-ink display setting.",
    );
    expect(mocks.storeSaves).toBe(0);
  });
});
