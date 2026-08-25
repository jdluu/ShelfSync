import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useStorageStore } from "@/store/storageStore";
import { useToastStore } from "@/store/toastStore";
import { safeStoreLoad } from "@/utils/tauri";

const mocks = vi.hoisted(() => ({
  isTauri: true,
  isMobile: false,
  storeData: new Map<string, unknown>(),
  storeLoadPaths: [] as string[],
  storeSets: [] as Array<[string, unknown]>,
  storeSaves: 0,
  failStoreLoad: false,
}));

vi.mock("@/utils/tauri", () => ({
  isTauri: vi.fn(() => mocks.isTauri),
  isMobile: vi.fn(() => mocks.isMobile),
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

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  dirname: vi.fn(async (p: string) => p.replace(/\/[^/]+$/, "")),
}));

const DEFAULT_PATH = "/storage/emulated/0/Documents/ShelfSync";

const store = () => useStorageStore.getState();
const toastMessages = () => useToastStore.getState().toasts.map((t) => t.message);

describe("offline storage folder selection (#13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTauri = true;
    mocks.isMobile = false;
    mocks.storeData.clear();
    mocks.storeLoadPaths.length = 0;
    mocks.storeSets.length = 0;
    mocks.storeSaves = 0;
    mocks.failStoreLoad = false;
    vi.mocked(invoke).mockResolvedValue(DEFAULT_PATH);
    vi.mocked(open).mockResolvedValue(null);
    vi.mocked(save).mockResolvedValue(null);
    useStorageStore.setState({
      libraryPath: "",
      offlineStoragePath: "",
      storageChoiceOpen: false,
    });
    useToastStore.setState({ toasts: [] });
  });

  describe("decision logic", () => {
    it("desktop uses the native directory picker directly", async () => {
      vi.mocked(open).mockResolvedValue("/home/user/books");

      await store().selectOfflineStorageFolder();

      expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
      expect(save).not.toHaveBeenCalled();
      expect(store().storageChoiceOpen).toBe(false);
      expect(store().offlineStoragePath).toBe("/home/user/books");
    });

    it("mobile presents the two-option choice without touching pickers", async () => {
      mocks.isMobile = true;

      await store().selectOfflineStorageFolder();

      expect(store().storageChoiceOpen).toBe(true);
      expect(open).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
      expect(toastMessages()).toEqual([]);
    });
  });

  describe("recommended location option", () => {
    it("resolves the backend default, persists it, closes the choice, and shows the path", async () => {
      mocks.isMobile = true;
      await store().selectOfflineStorageFolder();

      await store().chooseRecommendedStorage();

      expect(invoke).toHaveBeenCalledWith("get_default_storage_path");
      expect(store().offlineStoragePath).toBe(DEFAULT_PATH);
      expect(mocks.storeData.get("offline_storage_path")).toBe(DEFAULT_PATH);
      expect(store().storageChoiceOpen).toBe(false);
      expect(toastMessages()).toContain(`Downloads will be saved to ${DEFAULT_PATH}`);
    });

    it("keeps the choice open and reports an error when the backend fails", async () => {
      mocks.isMobile = true;
      await store().selectOfflineStorageFolder();
      vi.mocked(invoke).mockRejectedValue(new Error("backend unavailable"));

      await store().chooseRecommendedStorage();

      expect(store().offlineStoragePath).toBe("");
      expect(store().storageChoiceOpen).toBe(true);
      const errors = useToastStore.getState().toasts.filter((t) => t.type === "error");
      expect(errors).toHaveLength(1);
    });

    it("keeps the choice open when the backend returns an empty path", async () => {
      mocks.isMobile = true;
      await store().selectOfflineStorageFolder();
      vi.mocked(invoke).mockResolvedValue("");

      await store().chooseRecommendedStorage();

      expect(store().offlineStoragePath).toBe("");
      expect(store().storageChoiceOpen).toBe(true);
    });
  });

  describe("browse fallback option", () => {
    it("persists the chosen folder via the file-browser fallback and shows the path", async () => {
      mocks.isMobile = true;
      await store().selectOfflineStorageFolder();
      vi.mocked(save).mockResolvedValue("/storage/emulated/0/Books/SHELF_SYNC_TARGET.txt");

      await store().browseForStorage();

      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: "SHELF_SYNC_TARGET.txt" }),
      );
      expect(store().offlineStoragePath).toBe("/storage/emulated/0/Books");
      expect(store().storageChoiceOpen).toBe(false);
      expect(toastMessages()).toContain("Downloads will be saved to /storage/emulated/0/Books");
    });

    it("never surfaces the placeholder filename in any toast", async () => {
      mocks.isMobile = true;
      await store().selectOfflineStorageFolder();
      vi.mocked(save).mockResolvedValue("/storage/emulated/0/Books/SHELF_SYNC_TARGET.txt");

      await store().browseForStorage();

      expect(toastMessages().some((m) => m.includes("SHELF_SYNC_TARGET.txt"))).toBe(false);
    });

    it("keeps the choice open after cancelling the browser so another option can be picked", async () => {
      mocks.isMobile = true;
      await store().selectOfflineStorageFolder();

      await store().browseForStorage();

      expect(save).toHaveBeenCalledTimes(1);
      expect(store().offlineStoragePath).toBe("");
      expect(store().storageChoiceOpen).toBe(true);
      expect(useToastStore.getState().toasts.some((t) => t.type === "success")).toBe(false);
    });
  });

  describe("dismissal", () => {
    it("closes the choice without changing the stored path", async () => {
      mocks.isMobile = true;
      await store().selectOfflineStorageFolder();

      store().dismissStorageChoice();

      expect(store().storageChoiceOpen).toBe(false);
      expect(store().offlineStoragePath).toBe("");
      expect(invoke).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });
  });
});

describe("setOfflineStoragePath persistence (#33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTauri = true;
    mocks.isMobile = false;
    mocks.storeData.clear();
    mocks.storeLoadPaths.length = 0;
    mocks.storeSets.length = 0;
    mocks.storeSaves = 0;
    mocks.failStoreLoad = false;
    useStorageStore.setState({
      libraryPath: "",
      offlineStoragePath: "",
      storageChoiceOpen: false,
    });
    useToastStore.setState({ toasts: [] });
  });

  it("persists the path through the settings store and saves it", async () => {
    await useStorageStore.getState().setOfflineStoragePath("/data/downloads");

    expect(useStorageStore.getState().offlineStoragePath).toBe("/data/downloads");
    expect(vi.mocked(safeStoreLoad)).toHaveBeenCalledWith("shelfsync_settings.json");
    expect(mocks.storeSets).toContainEqual(["offline_storage_path", "/data/downloads"]);
    expect(mocks.storeSaves).toBeGreaterThan(0);
  });

  it("keeps the in-memory path but reports an error when persistence fails", async () => {
    mocks.failStoreLoad = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await useStorageStore.getState().setOfflineStoragePath("/data/downloads");
      expect(errorSpy).toHaveBeenCalledWith(
        "[Settings Error] Failed to save offline storage path.",
      );
    } finally {
      errorSpy.mockRestore();
    }

    expect(useStorageStore.getState().offlineStoragePath).toBe("/data/downloads");
    expect(mocks.storeSaves).toBe(0);
  });
});

describe("storageChoiceOpen lifecycle (#33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTauri = true;
    mocks.isMobile = true;
    mocks.storeData.clear();
    vi.mocked(invoke).mockResolvedValue(DEFAULT_PATH);
    vi.mocked(open).mockResolvedValue(null);
    vi.mocked(save).mockResolvedValue(null);
    useStorageStore.setState({
      libraryPath: "",
      offlineStoragePath: "",
      storageChoiceOpen: false,
    });
    useToastStore.setState({ toasts: [] });
  });

  it("walks open → resolve via recommendation → reopen → dismiss", async () => {
    await store().selectOfflineStorageFolder();
    expect(store().storageChoiceOpen).toBe(true);

    await store().chooseRecommendedStorage();
    expect(store().storageChoiceOpen).toBe(false);
    expect(store().offlineStoragePath).toBe(DEFAULT_PATH);

    // The choice can be presented again later (e.g. user clears the path)
    useStorageStore.setState({ offlineStoragePath: "" });
    await store().selectOfflineStorageFolder();
    expect(store().storageChoiceOpen).toBe(true);

    store().dismissStorageChoice();
    expect(store().storageChoiceOpen).toBe(false);
    expect(store().offlineStoragePath).toBe("");
  });

  it("never opens the choice modal during a successful desktop pick", async () => {
    mocks.isMobile = false;
    vi.mocked(open).mockResolvedValue("/home/user/books");

    await store().selectOfflineStorageFolder();

    expect(store().storageChoiceOpen).toBe(false);
    expect(store().offlineStoragePath).toBe("/home/user/books");
  });

  it("stays open across a cancelled browse until another option resolves", async () => {
    await store().selectOfflineStorageFolder();
    expect(store().storageChoiceOpen).toBe(true);

    await store().browseForStorage(); // save dialog cancelled
    expect(store().storageChoiceOpen).toBe(true);

    vi.mocked(save).mockResolvedValue("/sdcard/Books/SHELF_SYNC_TARGET.txt");
    await store().browseForStorage();
    expect(store().storageChoiceOpen).toBe(false);
    expect(store().offlineStoragePath).toBe("/sdcard/Books");
  });
});
