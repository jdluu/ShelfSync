import { isTauri, safeInvoke, safeStoreLoad } from "@/utils/tauri";
import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { useCheckPin, useHostManifest, useLocalLibrary } from "@/hooks/useLibraryQuery";
import { useSyncProgress } from "@/hooks/useSyncProgress";
import { httpClient } from "@/services/api";
import { getLocalBooks, initDB } from "@/services/local-db";
import type { Book, Host } from "@/types/core";
import type { AppMode, LibraryContextType } from "@/types/library";

declare global {
  interface Window {
    __TEST_RESET__?: boolean;
    __TEST_MOCK_LIBRARY_PATH__?: string;
    __TEST_MOCK_MANIFEST_RESULTS__?: Book[];
  }
}

const STORE_PATH = "shelfsync_settings.json";

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

type State = {
  appMode: AppMode;
  libraryPath: string;
  localBooks: Book[];
  connectedHost: Host | null;
  authTokens: Record<string, string>;
  manualError: string | null;
};

type Action =
  | { type: "SET_ALL"; payload: Partial<State> }
  | { type: "SET_MODE"; payload: AppMode }
  | { type: "SET_LIBRARY_PATH"; payload: string }
  | { type: "SET_LOCAL_BOOKS"; payload: Book[] }
  | { type: "SET_CONNECTED_HOST"; payload: Host | null }
  | { type: "SET_AUTH_TOKENS"; payload: Record<string, string> }
  | { type: "SET_MANUAL_ERROR"; payload: string | null };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "SET_ALL":
      return { ...state, ...action.payload };
    case "SET_MODE":
      return { ...state, appMode: action.payload };
    case "SET_LIBRARY_PATH":
      return { ...state, libraryPath: action.payload };
    case "SET_LOCAL_BOOKS":
      return { ...state, localBooks: action.payload };
    case "SET_CONNECTED_HOST":
      return { ...state, connectedHost: action.payload };
    case "SET_AUTH_TOKENS":
      return { ...state, authTokens: action.payload };
    case "SET_MANUAL_ERROR":
      return { ...state, manualError: action.payload };
    default:
      return state;
  }
};

/**
 * Provides library data and actions to the application.
 * Handles state initialization, data fetching via React Query hooks, and WebSocket listeners for sync progress.
 */
export const LibraryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, {
    appMode: "unselected",
    libraryPath: "",
    localBooks: [],
    connectedHost: null,
    authTokens: {},
    manualError: null,
  });

  const { appMode, libraryPath, localBooks, connectedHost, authTokens, manualError } = state;

  // Use Ref to access latest books without re-subscribing
  const booksRef = useRef<Book[]>([]);

  // Derived credentials
  const hostKey = connectedHost ? `${connectedHost.ip}:${connectedHost.port}` : "";
  const token = authTokens[hostKey];

  // --- Queries & Mutations ---
  const remoteQuery = useHostManifest(connectedHost, token, appMode === "client");
  const localQuery = useLocalLibrary(appMode === "host" ? libraryPath : null);
  const checkPinMutation = useCheckPin();

  // --- External Hooks ---
  const syncProgress = useSyncProgress(booksRef, (books) => {
    dispatch({ type: "SET_LOCAL_BOOKS", payload: books });
  });

  // --- Derived State ---
  let books: Book[] = [];
  let loading = false;
  let authRequired = false;
  let pairingHost: Host | null = null;

  if (appMode === "client") {
    books = remoteQuery.data || [];
    loading = remoteQuery.isLoading;
    if (remoteQuery.error) {
      if (remoteQuery.error.message === "Unauthorized") {
        authRequired = true;
        pairingHost = connectedHost;
      }
    }
  } else if (appMode === "host") {
    books = localQuery.data || [];
    loading = localQuery.isLoading;
  }

  // Update ref when books change
  useEffect(() => {
    booksRef.current = books;
    // biome-ignore lint/correctness/useExhaustiveDependencies: books is derived state
  }, [books]);

  const error =
    manualError ||
    (appMode === "client" && remoteQuery.error?.message !== "Unauthorized"
      ? remoteQuery.error?.message
      : null) ||
    (appMode === "host" ? localQuery.error?.message : null);

  // Load Settings on Mount using Promise.all
  useEffect(() => {
    async function loadSettings() {
      try {
        const store = await safeStoreLoad(STORE_PATH);

        // TEST HOOK: If Playwright sets this flag, clear the store.
        if (window.__TEST_RESET__) {
          await store.clear();
          await store.save();
        }

        const [savedMode, savedPath, savedTokens] = await Promise.all([
          store.get<AppMode>("app_mode"),
          store.get<string>("library_path"),
          store.get<Record<string, string>>("auth_tokens"),
        ]);

        const nextState: Partial<State> = {};
        if (savedMode) nextState.appMode = savedMode;
        if (savedPath) nextState.libraryPath = savedPath;
        if (savedTokens) nextState.authTokens = savedTokens;

        if (savedMode === "client") {
          await initDB();
          nextState.localBooks = await getLocalBooks();
        }

        dispatch({ type: "SET_ALL", payload: nextState });
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    }
    loadSettings();
  }, []);

  // Sync Progress on Connect
  // When remoteQuery succeeds, fetch progress and update local DB
  useEffect(() => {
    async function syncProgressEffect() {
      if (appMode === "client" && connectedHost && token && remoteQuery.isSuccess) {
        try {
          const progress = await httpClient.getProgress(connectedHost, token);
          const db = await import("@/services/local-db");
          for (const p of progress) {
            await db.updateReadStatus(p.book_id, p.status as "unread" | "reading" | "finished");
          }
          const stored = await db.getLocalBooks();
          dispatch({ type: "SET_LOCAL_BOOKS", payload: stored });
        } catch (e) {
          console.error("Failed to sync progress on connect", e);
        }
      }
    }
    syncProgressEffect();
  }, [appMode, connectedHost, token, remoteQuery.isSuccess]);

  const setAppMode = async (mode: AppMode) => {
    dispatch({ type: "SET_MODE", payload: mode });
    const store = await safeStoreLoad(STORE_PATH);
    await store.set("app_mode", mode);
    await store.save();

    if (mode === "client") {
      dispatch({ type: "SET_CONNECTED_HOST", payload: null });
      // books is derived, no need to set
      try {
        await initDB();
        const stored = await getLocalBooks();
        dispatch({ type: "SET_LOCAL_BOOKS", payload: stored });
      } catch (e) {
        console.error("Failed to init local DB:", e);
      }
    }
  };

  const connectToHost = async (host: Host) => {
    // Just setting the host triggers the query
    dispatch({ type: "SET_CONNECTED_HOST", payload: host });
  };

  const pair = async (pin: string) => {
    if (!pairingHost) return;

    try {
      const newToken = await checkPinMutation.mutateAsync({ host: pairingHost, pin });

      const hostKey = `${pairingHost.ip}:${pairingHost.port}`;
      const newTokens = { ...authTokens, [hostKey]: newToken };
      dispatch({ type: "SET_AUTH_TOKENS", payload: newTokens });

      const store = await safeStoreLoad(STORE_PATH);
      await store.set("auth_tokens", newTokens);
      await store.save();

      // Auth required will clear on next render because query will retry with new token
    } catch (e) {
      // let the error be handled by the mutation state or caught here
      console.error("Pairing failed", e);
    }
  };

  const disconnect = () => {
    dispatch({ type: "SET_CONNECTED_HOST", payload: null });
  };

  const syncBook = async (book: Book) => {
    await syncBooks([book]);
  };

  const syncBooks = async (booksToSync: Book[]) => {
    // TEST HOOK: Bypass in multi-instance E2E
    if (window.__TEST_MOCK_MANIFEST_RESULTS__) {
      return;
    }

    if (!connectedHost) return;
    const hostKey = `${connectedHost.ip}:${connectedHost.port}`;
    const token = authTokens[hostKey];
    if (!token) return;

    try {
      const destRoot = isTauri()
        ? await (await import("@tauri-apps/api/path")).appDataDir()
        : "";

      await safeInvoke("start_bulk_sync", {
        books: booksToSync,
        hostIp: connectedHost.ip,
        hostPort: connectedHost.port,
        token: token,
        destinationRoot: destRoot,
      });

      // Request notification permission if needed
      if (isTauri()) {
        const { isPermissionGranted, requestPermission } = await import(
          "@tauri-apps/plugin-notification"
        );
        const permission = await isPermissionGranted();
        if (!permission) {
          const permission = await requestPermission();
          console.log("Notification permission:", permission);
        }
      }
    } catch (e) {
      console.error("Bulk sync failed:", e);
      dispatch({ type: "SET_MANUAL_ERROR", payload: "Failed to start synchronization." });
    }
  };

  const selectLibraryFolder = async () => {
    try {
      // TEST HOOK: Bypass the native system OS dialog
      if (window.__TEST_MOCK_LIBRARY_PATH__) {
        dispatch({ type: "SET_LIBRARY_PATH", payload: window.__TEST_MOCK_LIBRARY_PATH__ });
        const store = await safeStoreLoad(STORE_PATH);
        await store.set("library_path", window.__TEST_MOCK_LIBRARY_PATH__);
        await store.save();
        return;
      }

      if (!isTauri()) {
        dispatch({
          type: "SET_MANUAL_ERROR",
          payload: "Library selection is only available in the desktop app.",
        });
        return;
      }

      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Calibre Library Folder",
      });

      if (selected && typeof selected === "string") {
        dispatch({ type: "SET_LIBRARY_PATH", payload: selected });
        const store = await safeStoreLoad(STORE_PATH);
        await store.set("library_path", selected);
        await store.save();
        // localQuery will automatically refetch because libraryPath changed
      }
    } catch (e) {
      dispatch({ type: "SET_MANUAL_ERROR", payload: `Failed to open dialog: ${e}` });
    }
  };

  const openLocalBook = async (path: string) => {
    if (isTauri()) {
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(path);
    } else {
      console.log("Opening book path in browser (not supported):", path);
    }
  };

  const toggleReadStatus = async (book: Book) => {
    // Rotate status: unread -> reading -> finished -> unread
    const current = book.read_status || "unread";
    let next: "unread" | "reading" | "finished" = "reading";
    if (current === "reading") next = "finished";
    if (current === "finished") next = "unread";

    try {
      // Update DB
      await import("@/services/local-db").then((m) => m.updateReadStatus(book.id, next));

      // Update State locally
      dispatch({
        type: "SET_LOCAL_BOOKS",
        payload: localBooks.map((b) => (b.id === book.id ? { ...b, read_status: next } : b)),
      });

      // Push to Host if connected
      if (connectedHost) {
        const hostKey = `${connectedHost.ip}:${connectedHost.port}`;
        const token = authTokens[hostKey];
        if (token) {
          httpClient
            .updateProgress(connectedHost, token, book.remote_id || book.id, next)
            .catch((e) => console.error("Failed to push progress", e));
        }
      }
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  return (
    <LibraryContext.Provider
      value={{
        appMode,
        books,
        localBooks,
        loading,
        error: error || null,
        libraryPath,
        connectedHost,
        authRequired,
        pairingHost,
        authTokens,
        syncProgress,
        setAppMode,
        connectToHost,
        pair,
        disconnect,
        syncBook,
        syncBooks,
        selectLibraryFolder,
        openLocalBook,
        toggleReadStatus,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
};

export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (context === undefined) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return context;
};
