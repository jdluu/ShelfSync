import { useState, useEffect } from "react";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";
import { Book } from "./types";
import { FolderOpen, Book as BookIcon } from "lucide-react";

const STORE_PATH = "shelfsync_settings.json";

function App() {
  const [libraryPath, setLibraryPath] = useState<string>("");
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const store = await load(STORE_PATH);
        const savedPath = await store.get<string>("library_path");
        if (savedPath) {
          setLibraryPath(savedPath);
          fetchBooks(savedPath);
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    }
    loadSettings();
  }, []);

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

  return (
    <main className="container mx-auto p-6 dark:bg-slate-900 dark:text-white min-h-screen">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookIcon className="w-8 h-8 text-blue-500" />
            ShelfSync
          </h1>
          <p className="text-slate-400">Local Replica Sync Engine</p>
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
    </main>
  );
}

export default App;
