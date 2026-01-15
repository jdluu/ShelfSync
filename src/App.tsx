import { useState, useEffect } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";
import QRCode from "react-qr-code";
import { appDataDir, join } from "@tauri-apps/api/path";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Book } from "./types";
import { FolderOpen, Book as BookIcon, Network, Wifi } from "lucide-react";

import { RoleSelection } from "./components/RoleSelection";
import { Discovery } from "./components/Discovery";
import { initDB, getLocalBooks, saveBook } from "./db";

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

  // Load settings and connection info on mount
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

        const info = await invoke<ConnectionInfo>("get_connection_info");
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
        const response = await fetch(`http://${host.ip}:${host.port}/api/manifest`);
        if (!response.ok) throw new Error("Failed to fetch manifest from host");
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
        // 1. Download file
        const response = await fetch(`http://${connectedHost.ip}:${connectedHost.port}/api/download/${book.id}/epub`);
        if (!response.ok) throw new Error("Download failed");
        
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // 2. Save to local storage
        const fileName = `${book.title.replace(/[^a-z0-9]/gi, '_')}.epub`;
        const filePath = await join(await appDataDir(), fileName);
        
        // Ensure directory exists (appDataDir should exist, but good practice)
        // For simplicity using BaseDirectory.AppData
        // Note: writeBinaryFile documentation says we need to specify base dir if using relative path, 
        // OR use absolute path. join(appDataDir, ...) gives absolute.
        
        await writeFile(filePath, uint8Array);

        // 3. Update DB
        await saveBook(book, filePath);
        
        // Refresh local books
        const stored = await getLocalBooks();
        setLocalBooks(stored);

        alert(`Synced "${book.title}" successfully!`);
      } catch (e) {
          console.error("Sync failed:", e);
          alert("Failed to sync book. Check console.");
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
        // Save to store
        const store = await load(STORE_PATH);
        await store.set("library_path", selected);
        await store.save();
        
        // Fetch books
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
      const result = await invoke<Book[]>("get_books", { libraryPath: path });
      console.log("Books found:", result.length);
      setBooks(result);
    } catch (e) {
      console.error("Error fetching books:", e);
      setError(typeof e === 'string' ? e : "Failed to load library database. Make sure 'metadata.db' exists in the folder.");
    } finally {
      setLoading(false);
    }
  };

  if (appMode === "unselected") {
    return <RoleSelection onSelect={handleSelectMode} />;
  }

  if (appMode === "client") {
    return (
      <main className="container mx-auto p-6 dark:bg-slate-900 dark:text-white min-h-screen">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
                <BookIcon className="w-8 h-8 text-green-500" />
                ShelfSync Client
            </h1>
            {connectedHost && (
                <p className="text-slate-400">Connected to {connectedHost.hostname} ({connectedHost.ip})</p>
            )}
          </div>
          <div className="flex gap-4">
             {connectedHost && (
                <button 
                    onClick={() => setConnectedHost(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
                >
                    Disconnect
                </button>
             )}
            <button 
                onClick={() => handleSelectMode("unselected")}
                className="text-sm text-slate-500 hover:text-white transition-colors"
            >
                Change Role
            </button>
          </div>
        </header>

        {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-lg mb-6">
                {error}
            </div>
        )}

        {loading ? (
            <div className="text-center py-20 text-slate-400">Communicating with host...</div>
        ) : connectedHost ? (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Available Books (Remote)</h2>
                    <span className="bg-green-500/10 text-green-500 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                        Live Sync
                    </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {books.map((book) => (
                    <div key={book.id} className="bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-sm flex gap-4">
                        <div className="w-20 h-28 bg-slate-700 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {/* We could use the cover URL here */}
                            <BookIcon className="w-8 h-8 text-slate-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate" title={book.title}>{book.title}</h3>
                            <p className="text-sm text-slate-400 mb-2 truncate">{book.authors}</p>
                            <button 
                                onClick={() => handleSync(book)}
                                className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                            >
                                Sync to Replica
                            </button>
                        </div>
                    </div>
                    ))}
                </div>
            </div>
        ) : (
            <div className="space-y-12">
                <Discovery onConnect={handleConnect} />
                
                {localBooks.length > 0 && (
                    <div className="pt-8 border-t border-slate-800">
                        <h2 className="text-xl font-semibold mb-6">Local Library (Offline)</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {localBooks.map((book) => (
                            <div key={book.id} className="bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-sm flex gap-4 opacity-75">
                                <div className="w-20 h-28 bg-slate-700 rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    <BookIcon className="w-8 h-8 text-slate-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-lg truncate text-slate-300" title={book.title}>{book.title}</h3>
                                    <p className="text-sm text-slate-500 mb-2 truncate">{book.authors}</p>
                                    <span className="text-xs px-2 py-1 bg-slate-700 rounded text-slate-400">
                                        Downloaded
                                    </span>
                                </div>
                            </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}
      </main>
    );
  }

  return (
    <main className="container mx-auto p-6 dark:bg-slate-900 dark:text-white min-h-screen flex flex-col md:flex-row gap-6">
      <div className="flex-1">
        <header className="flex items-center justify-between mb-8">
            <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
                <BookIcon className="w-8 h-8 text-blue-500" />
                ShelfSync Host
            </h1>
            <p className="text-slate-400">Local Replica Sync Engine</p>
            <button 
              onClick={() => handleSelectMode("unselected")}
              className="mt-2 text-xs text-slate-500 hover:text-white transition-colors"
            >
              Change Role
            </button>
            </div>
            
            <div className="flex flex-col items-end gap-2">
                <button
                onClick={handleSelectFolder}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors cursor-pointer"
                >
                <FolderOpen className="w-4 h-4" />
                {libraryPath ? "Change Library" : "Select Library"}
                </button>
                <span className="text-xs text-slate-500 font-mono truncate max-w-[300px]" title={libraryPath}>
                    {libraryPath || "No library selected"}
                </span>
            </div>
        </header>


        {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-lg mb-6">
            {error}
            </div>
        )}

        {loading ? (
            <div className="text-center py-20 text-slate-400">Loading library...</div>
        ) : books.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {books.map((book) => (
                <div key={book.id} className="bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                    <h3 className="font-semibold text-lg truncate" title={book.title}>{book.title}</h3>
                    <p className="text-sm text-slate-400 mb-2 truncate">{book.authors}</p>
                    <div className="text-xs text-slate-600 font-mono break-all">{book.path}</div>
                </div>
                ))}
            </div>
        ) : (
            <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                {libraryPath ? (
                    <p className="text-slate-400">No books found in this library.</p>
                ) : (
                    <div className="space-y-2">
                        <p className="text-slate-300 font-medium">Welcome to ShelfSync Host</p>
                        <p className="text-slate-500 text-sm">Select your Calibre library folder to begin.</p>
                    </div>
                )}
            </div>
        )}
      </div>

      {/* Connectivity Sidebar */}
      <aside className="w-full md:w-80 bg-slate-800/50 p-6 rounded-xl border border-slate-700 h-fit">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Network className="w-5 h-5 text-green-500" />
            Connectivity
        </h2>
        
        {connectionInfo ? (
            <div className="space-y-6">
                <div className="bg-white p-4 rounded-lg w-full flex justify-center">
                    <QRCode 
                        value={JSON.stringify(connectionInfo)} 
                        size={200}
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                        viewBox={`0 0 256 256`}
                    />
                </div>
                
                <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
                        <Wifi className="w-5 h-5 text-slate-400" />
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Host IP</p>
                            <p className="font-mono text-lg">{connectionInfo.ip}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
                        <div className="w-5 h-5 flex items-center justify-center font-mono text-slate-400">:</div>
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Port</p>
                            <p className="font-mono text-lg">{connectionInfo.port}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
                        <div className="w-5 h-5 flex items-center justify-center font-mono text-slate-400">@</div>
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Hostname</p>
                            <p className="font-mono text-lg truncate" title={connectionInfo.hostname}>{connectionInfo.hostname}</p>
                        </div>
                    </div>
                </div>

                <div className="text-xs text-slate-500 text-center">
                    Scan this QR code with the ShelfSync mobile app to connect.
                </div>
            </div>
        ) : (
            <div className="text-center py-10 text-slate-400">
                Loading network info...
            </div>
        )}
      </aside>
    </main>
  );
}

export default App;
