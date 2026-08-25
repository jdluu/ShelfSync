import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "@/services/apiClient";
import { deleteBook, initDB, updateReadStatus } from "@/services/localDb";
import { useLibraryStore } from "@/store/libraryStore";
import { useStorageStore } from "@/store/storageStore";
import { useToastStore } from "@/store/toastStore";
import type { Book, Host } from "@/types/core";

const mocks = vi.hoisted(() => ({
  isTauri: false,
  isMobile: false,
  storeData: new Map<string, unknown>(),
  storeSets: [] as Array<[string, unknown]>,
  storeSaves: 0,
  failStoreLoad: false,
}));

vi.mock("@/utils/tauri", () => ({
  isTauri: vi.fn(() => mocks.isTauri),
  isMobile: vi.fn(() => mocks.isMobile),
  safeInvoke: vi.fn(async () => undefined),
  safeStoreLoad: vi.fn(async () => {
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

// Local database access goes through the Rust backend via safeInvoke; mock the
// service layer directly so assertions stay on the service-call boundary.
vi.mock("@/services/localDb", () => ({
  initDB: vi.fn(async () => undefined),
  saveBook: vi.fn(async () => undefined),
  updateReadStatus: vi.fn(async () => undefined),
  getLocalBooks: vi.fn(async () => []),
  deleteBook: vi.fn(async () => undefined),
}));

vi.mock("@/services/apiClient", () => ({
  httpClient: {
    updateProgress: vi.fn(async () => undefined),
  },
}));

const HOST: Host = { ip: "192.168.1.10", port: 8420, hostname: "shelf-host" };

const makeBook = (overrides: Partial<Book> & Pick<Book, "id">): Book => ({
  title: `Book ${overrides.id}`,
  authors: "Test Author",
  path: `library/${overrides.id}`,
  series: null,
  ...overrides,
});

const store = () => useLibraryStore.getState();
const successToasts = () =>
  useToastStore
    .getState()
    .toasts.filter((t) => t.type === "success")
    .map((t) => t.message);

describe("libraryStore actions (#33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTauri = false;
    mocks.isMobile = false;
    mocks.storeData.clear();
    mocks.storeSets.length = 0;
    mocks.storeSaves = 0;
    mocks.failStoreLoad = false;
    document.documentElement.classList.remove("e-ink");
    useLibraryStore.setState({ localBooks: [], eInkMode: false });
    useStorageStore.setState({
      libraryPath: "",
      offlineStoragePath: "",
      storageChoiceOpen: false,
    });
    useToastStore.setState({ toasts: [] });
  });

  describe("deleteLocalBook", () => {
    it("calls the delete service and removes only the target book", async () => {
      const keep = makeBook({ id: 1, title: "Keep Me" });
      const gone = makeBook({ id: 2, title: "Delete Me" });
      useLibraryStore.setState({ localBooks: [keep, gone] });

      await store().deleteLocalBook(gone);

      expect(deleteBook).toHaveBeenCalledTimes(1);
      expect(deleteBook).toHaveBeenCalledWith(2);
      expect(store().localBooks).toEqual([keep]);
      expect(successToasts()).toContain('"Delete Me" removed from device.');
    });

    it("leaves the library untouched and reports an error when deletion fails", async () => {
      const keep = makeBook({ id: 1, title: "Keep Me" });
      const gone = makeBook({ id: 2, title: "Delete Me" });
      useLibraryStore.setState({ localBooks: [keep, gone] });
      vi.mocked(deleteBook).mockRejectedValueOnce(new Error("backend refused"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        await store().deleteLocalBook(gone);
      } finally {
        errorSpy.mockRestore();
      }

      expect(store().localBooks).toEqual([keep, gone]);
      expect(successToasts()).toEqual([]);
    });
  });

  describe("toggleReadStatus", () => {
    it("advances unread → reading, updates state, and pushes progress to the host", async () => {
      const book = makeBook({
        id: 5,
        title: "Progress Book",
        remote_id: 77,
        read_status: "unread",
      });
      useLibraryStore.setState({ localBooks: [book] });

      await store().toggleReadStatus(book, HOST, "secret-token");

      expect(updateReadStatus).toHaveBeenCalledWith(5, "reading");
      expect(store().localBooks[0]?.read_status).toBe("reading");
      expect(httpClient.updateProgress).toHaveBeenCalledWith(HOST, "secret-token", 77, "reading");
    });

    it("cycles reading → finished → unread without a host connection", async () => {
      const book = makeBook({ id: 6, title: "Cycle Book", read_status: "reading" });
      useLibraryStore.setState({ localBooks: [book] });

      await store().toggleReadStatus(book);
      expect(updateReadStatus).toHaveBeenLastCalledWith(6, "finished");
      expect(store().localBooks[0]?.read_status).toBe("finished");

      // The next transition starts from the persisted status
      const finished = { ...book, read_status: "finished" as const };
      useLibraryStore.setState({ localBooks: [finished] });

      await store().toggleReadStatus(finished);
      expect(updateReadStatus).toHaveBeenLastCalledWith(6, "unread");
      expect(store().localBooks[0]?.read_status).toBe("unread");
      expect(httpClient.updateProgress).not.toHaveBeenCalled();
    });

    it("falls back to the local id when pushing progress for a book without remote_id", async () => {
      const book = makeBook({ id: 8, title: "No Remote", read_status: "unread" });
      useLibraryStore.setState({ localBooks: [book] });

      await store().toggleReadStatus(book, HOST, "secret-token");

      expect(httpClient.updateProgress).toHaveBeenCalledWith(HOST, "secret-token", 8, "reading");
    });

    it("keeps the previous status and reports an error when the update fails", async () => {
      const book = makeBook({ id: 9, title: "Failing Book", read_status: "unread" });
      useLibraryStore.setState({ localBooks: [book] });
      vi.mocked(updateReadStatus).mockRejectedValueOnce(new Error("db locked"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        await store().toggleReadStatus(book);
      } finally {
        errorSpy.mockRestore();
      }

      expect(store().localBooks[0]?.read_status).toBe("unread");
      expect(httpClient.updateProgress).not.toHaveBeenCalled();
    });
  });

  describe("loadSettings", () => {
    it("restores persisted paths into the storage store and applies e-ink mode", async () => {
      mocks.storeData.set("library_path", "/calibre/library");
      mocks.storeData.set("offline_storage_path", "/device/downloads");
      mocks.storeData.set("e_ink_mode", true);

      await store().loadSettings();

      expect(initDB).toHaveBeenCalledTimes(1);
      expect(useStorageStore.getState().libraryPath).toBe("/calibre/library");
      expect(useStorageStore.getState().offlineStoragePath).toBe("/device/downloads");
      expect(store().eInkMode).toBe(true);
      expect(document.documentElement.classList.contains("e-ink")).toBe(true);
    });

    it("reports a settings error instead of throwing when the store cannot load", async () => {
      mocks.failStoreLoad = true;
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        await store().loadSettings();
        expect(errorSpy).toHaveBeenCalledWith("[Settings Error] Failed to load library settings.");
      } finally {
        errorSpy.mockRestore();
      }

      expect(useStorageStore.getState().offlineStoragePath).toBe("");
    });
  });

  describe("setEInkMode", () => {
    it("toggles the document class and persists the preference", async () => {
      await store().setEInkMode(true);
      expect(store().eInkMode).toBe(true);
      expect(document.documentElement.classList.contains("e-ink")).toBe(true);
      expect(mocks.storeSets).toContainEqual(["e_ink_mode", true]);

      await store().setEInkMode(false);
      expect(store().eInkMode).toBe(false);
      expect(document.documentElement.classList.contains("e-ink")).toBe(false);
      expect(mocks.storeSets).toContainEqual(["e_ink_mode", false]);
      expect(mocks.storeSaves).toBe(2);
    });
  });
});
