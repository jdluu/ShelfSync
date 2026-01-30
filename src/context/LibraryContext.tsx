import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { load } from "@tauri-apps/plugin-store";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { appDataDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { Book } from "@/types";
import { initDB, getLocalBooks, saveBook as saveLocalBook } from "@/services/local-db";
import { Host } from "./DiscoveryContext";
import { useHostManifest, useLocalLibrary, useCheckPin } from "@/hooks/useLibraryQuery";

const STORE_PATH = "shelfsync_settings.json";

/**
 * Defines the shape of the Library Context.
 * Manages application mode, book data, host connections, and synchronization state.
 */
export type AppMode = "unselected" | "host" | "client";
interface LibraryContextType {
  // State
  appMode: AppMode;
  books: Book[];
  localBooks: Book[];
  loading: boolean;
  error: string | null;
  libraryPath: string;
  connectedHost: Host | null;
  authRequired: boolean;
  pairingHost: Host | null;
  authTokens: Record<string, string>;
  syncProgress: Record<number, any>; // bookId -> progress data

  // Actions
  setAppMode: (mode: AppMode) => Promise<void>;
  connectToHost: (host: Host) => Promise<void>;
  pair: (pin: string) => Promise<void>;
  disconnect: () => void;
  syncBook: (book: Book) => Promise<void>;
  syncBooks: (books: Book[]) => Promise<void>;
  selectLibraryFolder: () => Promise<void>;
  openLocalBook: (path: string) => Promise<void>;
  toggleReadStatus: (book: Book) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

/**
 * Provides library data and actions to the application.
 * Handles state initialization, data fetching via React Query hooks, and WebSocket listeners for sync progress.
 */
export const LibraryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [appMode, setAppModeState] = useState<AppMode>("unselected");
  const [libraryPath, setLibraryPath] = useState<string>("");
  const [localBooks, setLocalBooks] = useState<Book[]>([]);
  const [connectedHost, setConnectedHost] = useState<Host | null>(null);
  const [authTokens, setAuthTokens] = useState<Record<string, string>>({}); 
  const [syncProgress, setSyncProgress] = useState<Record<number, any>>({});

  // Derived credentials
  const hostKey = connectedHost ? `${connectedHost.ip}:${connectedHost.port}` : "";
  const token = authTokens[hostKey];

  // --- Queries & Mutations ---
  const remoteQuery = useHostManifest(connectedHost, token, appMode === "client");
  const localQuery = useLocalLibrary(appMode === "host" ? libraryPath : null);
  const checkPinMutation = useCheckPin();

  // --- Derived State ---
  let books: Book[] = [];
  let loading = false;
  let authRequired = false;
  let pairingHost: Host | null = null;
  
  // Manual error state for non-query actions (dialogs, etc)
  const [manualError, setManualError] = useState<string | null>(null);

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

  const error = manualError || (appMode === "client" && remoteQuery.error?.message !== "Unauthorized" ? remoteQuery.error?.message : null) || (appMode === "host" ? localQuery.error?.message : null);


  // Load Settings on Mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const store = await load(STORE_PATH);
        
        const savedMode = await store.get<AppMode>("app_mode");
        if (savedMode) setAppModeState(savedMode);

        const savedPath = await store.get<string>("library_path");
        if (savedPath) setLibraryPath(savedPath);
        
        const savedTokens = await store.get<Record<string, string>>("auth_tokens");
        if (savedTokens) setAuthTokens(savedTokens);

        // Always init local DB just in case
        if (savedMode === "client") {
            await initDB();
            const stored = await getLocalBooks();
            setLocalBooks(stored);
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    }
    loadSettings();
  }, []);

  // Listen for progress
  useEffect(() => {
     let unlisten: any;
     const setup = async () => {
         unlisten = await listen("sync-progress", async (event: any) => {
             const prog = event.payload;
             setSyncProgress(prev => ({ ...prev, [prog.book_id]: prog }));

             if (prog.status === "completed") {
                // Update local DB since the file is now there
                const path = await join(await appDataDir(), `${prog.title.replace(/[^a-z0-9]/gi, '_')}.epub`);
                // We need the original book object here, but we can't easily get it.
                // For now, let's assume we find it in the current books state.
                const fullBook = books.find(b => b.id === prog.book_id);
                if (fullBook) {
                    await saveLocalBook(fullBook, path);
                    const stored = await getLocalBooks();
                    setLocalBooks(stored);
                }

                if (await isPermissionGranted()) {
                    sendNotification({ title: 'Download Complete', body: `${prog.title} has been synced.` });
                }
             }
         });
     };
     setup();
     return () => unlisten?.then((f: any) => f());
  }, [books]); // Re-subscribe if books change to ensure closure captures new books... ideally we shouldn't rely on this closure

  // Sync Progress on Connect
  // When remoteQuery succeeds, fetch progress and update local DB
  useEffect(() => {
      async function syncProgressEffect() {
        if (appMode === "client" && connectedHost && token && remoteQuery.isSuccess) {
             try {
                const response = await fetch(`http://${connectedHost.ip}:${connectedHost.port}/api/progress`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (response.ok) {
                    const progress = await response.json() as { book_id: number, status: string }[];
                    const db = await import("@/services/local-db");
                    for (const p of progress) {
                        await db.updateReadStatus(p.book_id, p.status as any);
                    }
                    const stored = await db.getLocalBooks();
                    setLocalBooks(stored);
                }
            } catch (e) {
                console.error("Failed to sync progress on connect", e);
            }
        }
      }
      syncProgressEffect();
  }, [appMode, connectedHost, token, remoteQuery.isSuccess]);


  const setAppMode = async (mode: AppMode) => {
    setAppModeState(mode);
    const store = await load(STORE_PATH);
    await store.set("app_mode", mode);
    await store.save();

    if (mode === "client") {
        setConnectedHost(null);
        // books is derived, no need to set
        try {
            await initDB();
            const stored = await getLocalBooks();
            setLocalBooks(stored);
        } catch (e) {
            console.error("Failed to init local DB:", e);
        }
    }
  };

  const connectToHost = async (host: Host) => {
    // Just setting the host triggers the query
    setConnectedHost(host);
  };

  const pair = async (pin: string) => {
      if (!pairingHost) return;
      
      try {
          const newToken = await checkPinMutation.mutateAsync({ host: pairingHost, pin });
          
          const hostKey = `${pairingHost.ip}:${pairingHost.port}`;
          const newTokens = { ...authTokens, [hostKey]: newToken };
          setAuthTokens(newTokens);
          
          const store = await load(STORE_PATH);
          await store.set("auth_tokens", newTokens);
          await store.save();
          
          // Auth required will clear on next render because query will retry with new token
      } catch (e) {
          // let the error be handled by the mutation state or caught here
          console.error("Pairing failed", e);
      }
  };

  const disconnect = () => {
      setConnectedHost(null);
  };

  const syncBook = async (book: Book) => {
      await syncBooks([book]);
  };

  const syncBooks = async (booksToSync: Book[]) => {
      if (!connectedHost) return;
      const hostKey = `${connectedHost.ip}:${connectedHost.port}`;
      const token = authTokens[hostKey];
      if (!token) return;

      try {
          const destRoot = await appDataDir();
          await invoke("start_bulk_sync", {
              books: booksToSync,
              hostIp: connectedHost.ip,
              hostPort: connectedHost.port,
              token: token,
              destinationRoot: destRoot
          });

          // Request notification permission if needed
          let permission = await isPermissionGranted();
          if (!permission) {
              const permission = await requestPermission();
              console.log("Notification permission:", permission);
          }
      } catch (e) {
          console.error("Bulk sync failed:", e);
          setManualError("Failed to start synchronization.");
      }
  };

  const selectLibraryFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Calibre Library Folder",
      });

      if (selected && typeof selected === "string") {
        setLibraryPath(selected);
        const store = await load(STORE_PATH);
        await store.set("library_path", selected);
        await store.save();
        // localQuery will automatically refetch because libraryPath changed
      }
    } catch (e) {
      setManualError("Failed to open dialog: " + e);
    }
  };

  const openLocalBook = async (path: string) => {
      await openPath(path);
  };

  const toggleReadStatus = async (book: Book) => {
      // Rotate status: unread -> reading -> finished -> unread
      const current = book.read_status || 'unread';
      let next: 'unread' | 'reading' | 'finished' = 'reading';
      if (current === 'reading') next = 'finished';
      if (current === 'finished') next = 'unread';

      try {
          // Update DB
          await import("@/services/local-db").then(m => m.updateReadStatus(book.id, next));
          
          // Update State locally
          setLocalBooks(prev => prev.map(b => 
              b.id === book.id ? { ...b, read_status: next } : b
          ));

          // Push to Host if connected
          if (connectedHost) {
              const hostKey = `${connectedHost.ip}:${connectedHost.port}`;
              const token = authTokens[hostKey];
              fetch(`http://${connectedHost.ip}:${connectedHost.port}/api/progress`, {
                  method: "POST",
                  headers: { 
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${token}`
                  },
                  body: JSON.stringify({ book_id: book.remote_id || book.id, status: next })
              }).catch(e => console.error("Failed to push progress", e));
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
        toggleReadStatus
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
