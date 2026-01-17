import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { appDataDir, join } from "@tauri-apps/api/path";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Book } from "@/types";

import { RoleSelection } from "@/features/RoleSelection";
import { HostDashboard } from "@/features/host/HostDashboard";
import { ClientDashboard } from "@/features/client/ClientDashboard";
import { initDB, getLocalBooks, saveBook } from "@/services/local-db";
import { api } from "@/services/api";

const STORE_PATH = "shelfsync_settings.json";

interface Host {
  ip: string;
  port: number;
  hostname: string;
}

interface ConnectionInfo {
  ip: string;
  port: number;
  hostname: string;
}

type AppMode = "unselected" | "host" | "client";

function App() {
  const [appMode, setAppMode] = useState<AppMode>("unselected");
  const [libraryPath, setLibraryPath] = useState<string>("");
  const [books, setBooks] = useState<Book[]>([]);
  const [localBooks, setLocalBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [connectedHost, setConnectedHost] = useState<Host | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const store = await load(STORE_PATH);
        
        const savedMode = await store.get<AppMode>("app_mode");
        if (savedMode) {
          setAppMode(savedMode);
        }

        const savedPath = await store.get<string>("library_path");
        if (savedPath) {
          setLibraryPath(savedPath);
          fetchBooks(savedPath);
        }

        const info = await api.network.getConnectionInfo();
        setConnectionInfo(info);
      } catch (e) {
        console.error("Failed to load data:", e);
      }
    }
    loadData();
  }, []);

  const handleSelectMode = async (mode: AppMode) => {
    setAppMode(mode);
    const store = await load(STORE_PATH);
    await store.set("app_mode", mode);
    await store.save();
    if (mode === "client") {
        setConnectedHost(null);
        setBooks([]);
        try {
            await initDB();
            const stored = await getLocalBooks();
            setLocalBooks(stored);
        } catch (e) {
            console.error("Failed to init local DB:", e);
        }
    }
  };

  const handleConnect = async (host: Host) => {
    setConnectedHost(host);
    setLoading(true);
    setError(null);
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000); 

        const response = await fetch(`http://${host.ip}:${host.port}/api/manifest`, {
            signal: controller.signal
        });
        clearTimeout(id);
        
        if (!response.ok) throw new Error("Failed to fetch manifest");
        const data = await response.json();
        setBooks(data);
    } catch (e) {
        console.error("Connection error:", e);
        setError("Could not connect to host. Make sure it's running and accessible.");
    } finally {
        setLoading(false);
    }
  };

  const handleSync = async (book: Book) => {
      if (!connectedHost) return;
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 30000); 

        const response = await fetch(`http://${connectedHost.ip}:${connectedHost.port}/api/download/${book.id}/epub`, {
             signal: controller.signal
        });
        clearTimeout(id);

        if (!response.ok) throw new Error("Download failed");
        
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const fileName = `${book.title.replace(/[^a-z0-9]/gi, '_')}.epub`;
        const filePath = await join(await appDataDir(), fileName);
        
        await writeFile(filePath, uint8Array);
        await saveBook(book, filePath);
        
        const stored = await getLocalBooks();
        setLocalBooks(stored);

        console.log(`Synced "${book.title}" successfully!`);
      } catch (e) {
          console.error("Sync failed:", e);
          setError("Failed to sync book. Check console.");
      }
  };

  const handleSelectFolder = async () => {
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
        fetchBooks(selected);
      }
    } catch (e) {
      setError("Failed to open dialog: " + e);
    }
  };

  const fetchBooks = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.library.getBooks(path);
      setBooks(result);
    } catch (e) {
      console.error("Error fetching books:", e);
      setError(typeof e === 'string' ? e : "Failed to load library database.");
    } finally {
      setLoading(false);
    }
  };

  if (appMode === "unselected") {
    return <RoleSelection onSelect={handleSelectMode} />;
  }

  if (appMode === "client") {
    return (
      <ClientDashboard 
        books={books}
        localBooks={localBooks}
        loading={loading}
        error={error}
        connectedHost={connectedHost}
        onConnect={handleConnect}
        onDisconnect={() => setConnectedHost(null)}
        onSync={handleSync}
        onOpenBook={(path) => openPath(path)}
        onChangeRole={() => handleSelectMode("unselected")}
      />
    );
  }

  // Host Mode
  return (
    <HostDashboard 
        books={books}
        loading={loading}
        error={error}
        libraryPath={libraryPath}
        connectionInfo={connectionInfo}
        onSelectFolder={handleSelectFolder}
        onChangeRole={() => handleSelectMode("unselected")}
    />
  );
}

export default App;
