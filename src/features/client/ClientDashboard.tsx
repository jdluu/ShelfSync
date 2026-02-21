import { Search, WifiOff } from "lucide-react";
import React, { useEffect } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { BookCard } from "@/components/library/BookCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueueOverlay } from "@/components/ui/QueueOverlay";
import { SearchBar } from "@/components/ui/SearchBar";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { SortMenu, type SortOption } from "@/components/ui/SortMenu";
import { useLibrary } from "@/contexts/LibraryContext";
import { Discovery } from "@/features/discovery/Discovery";
import type { Book, Host } from "@/types/core";

interface ClientDashboardProps {
  books: Book[];
  localBooks: Book[];
  loading: boolean;
  error: string | null;
  connectedHost: Host | null;
  onConnect: (host: Host) => void;
  onDisconnect: () => void;
  onSync: (book: Book) => Promise<void>;
  onOpenBook: (path: string) => void;
  onToggleStatus: (book: Book) => Promise<void>;
  onChangeRole: () => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
  books,
  localBooks,
  loading,
  error,
  connectedHost,
  onConnect,
  onDisconnect,
  onSync,
  onOpenBook,
  onToggleStatus,
  onChangeRole,
}) => {
  const { syncProgress, syncBooks } = useLibrary();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortOption, setSortOption] = React.useState<SortOption>("title");
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());

  const filterAndSort = (list: Book[]) => {
    let result = [...list];

    // Filter
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(lower) ||
          b.authors.toLowerCase().includes(lower) ||
          b.series?.toLowerCase().includes(lower) ||
          b.tags?.some((t) => t.toLowerCase().includes(lower)),
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortOption === "title") return a.title.localeCompare(b.title);
      if (sortOption === "author") return a.authors.localeCompare(b.authors);
      if (sortOption === "recent") return (b.id || 0) - (a.id || 0);
      if (sortOption === "series") {
        const sA = a.series || "";
        const sB = b.series || "";
        if (sA !== sB) return sA.localeCompare(sB);
        return (a.series_index || 0) - (b.series_index || 0);
      }
      return 0;
    });

    return result;
  };

  const filteredRemoteBooks = filterAndSort(books);
  const filteredLocalBooks = filterAndSort(localBooks);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectionMode(false);
        setSelectedIds(new Set());
      }
      if (selectionMode && (e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const allFilteredIds = new Set(filteredRemoteBooks.map((b) => b.id));
        setSelectedIds(allFilteredIds);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [selectionMode, filteredRemoteBooks]);

  const handleSync = async (book: Book) => {
    await onSync(book);
  };

  const toggleSelection = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const startBulkSync = async () => {
    const toSync = books.filter((b) => selectedIds.has(b.id));
    await syncBooks(toSync);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  return (
    <>
      <SkipLink />
      <Header
        title="Client Dashboard"
        onChangeRole={onChangeRole}
        actions={
          connectedHost && (
            <div className="flex items-center gap-2 mr-2">
              <button
                type="button"
                onClick={() => {
                  setSelectionMode(!selectionMode);
                  setSelectedIds(new Set());
                }}
                className={`btn btn-sm ${selectionMode ? "btn-primary" : "btn-outline"}`}
              >
                {selectionMode ? "Cancel Selection" : "Select Multiple"}
              </button>
              <button
                type="button"
                onClick={onDisconnect}
                className="btn btn-sm btn-ghost border border-base-300"
              >
                Disconnect
              </button>
            </div>
          )
        }
      />

      <main id="main-content" className="flex-grow bg-base-100 p-4 sm:p-8">
        <div className="container mx-auto max-w-7xl">
          {connectedHost && (
            <div className="mb-6 sm:mb-8 p-4 bg-primary/5 border border-primary/20 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-[10px] sm:text-xs font-bold text-primary uppercase tracking-widest">
                  Connected To
                </p>
                <p className="text-lg sm:text-xl font-bold text-base-content/90 break-all leading-tight">
                  {connectedHost.hostname}{" "}
                  <span className="opacity-40 sm:ml-1 font-mono text-xs sm:text-sm block sm:inline">
                    ({connectedHost.ip})
                  </span>
                </p>
              </div>
              <div className="badge badge-success badge-md sm:badge-lg gap-2 font-bold px-3 sm:px-4 py-3 shrink-0">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                Live Sync
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="alert alert-error mb-6">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                role="img"
                aria-label="Error"
              >
                <title>Error</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              aria-live="polite"
              aria-busy="true"
            >
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : connectedHost ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl sm:text-2xl font-bold">Available Books</h2>
                  <span className="badge badge-success badge-sm sm:badge-lg text-white">
                    Live Sync
                  </span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="flex-grow sm:flex-initial">
                    <SearchBar value={searchTerm} onChange={setSearchTerm} />
                  </div>
                  <SortMenu value={sortOption} onChange={setSortOption} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRemoteBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    host={connectedHost}
                    variant="remote"
                    onAction={handleSync}
                    selected={selectedIds.has(book.id)}
                    selectable={selectionMode}
                    onSelect={() => toggleSelection(book.id)}
                    syncStatus={syncProgress[book.id]}
                    actionLabel="Sync to Replica"
                    actionColor="blue"
                  />
                ))}
              </div>

              {connectedHost && filteredRemoteBooks.length === 0 && !loading && (
                <div className="py-12">
                  <EmptyState
                    icon={Search}
                    title="No Books Found"
                    description={
                      searchTerm
                        ? `No results for "${searchTerm}" in this library.`
                        : "This library appears to be empty."
                    }
                    actionLabel={searchTerm ? "Clear Search" : undefined}
                    onAction={() => setSearchTerm("")}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-12">
              <Discovery onConnect={onConnect} />

              {localBooks.length > 0 && (
                <div className="pt-8 border-t border-base-300">
                  <h2 className="text-2xl font-bold mb-6">Local Library (Offline)</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredLocalBooks.map((book) => (
                      <BookCard
                        key={book.id}
                        book={book}
                        variant="local"
                        onAction={() => onOpenBook(book.local_path || "")}
                        onToggleStatus={onToggleStatus}
                        actionLabel="Read"
                        actionColor="green"
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="py-12">
                <EmptyState
                  icon={WifiOff}
                  title="Not Connected"
                  description="Connect to a host to browse and sync books."
                />
              </div>
            </div>
          )}
        </div>
      </main>
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2500] bg-base-100 p-4 rounded-xl shadow-2xl border border-primary w-[calc(100%-2rem)] max-w-md">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="font-bold">{selectedIds.size} selected</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setSelectedIds(new Set(filteredRemoteBooks.map((b) => b.id)))}
                >
                  All
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setSelectedIds(new Set())}
                >
                  None
                </button>
              </div>
            </div>
            <button type="button" className="btn btn-primary w-full" onClick={startBulkSync}>
              Sync Selected to Device
            </button>
          </div>
        </div>
      )}
      <QueueOverlay progress={syncProgress} />
      <Footer />
    </>
  );
};
