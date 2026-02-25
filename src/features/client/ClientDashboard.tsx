import { ArrowUp, LayoutGrid, List, Search, WifiOff } from "lucide-react";
import React, { useEffect, useState } from "react";
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
  const { syncProgress, syncBooks, refresh, clearError } = useLibrary();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortOption, setSortOption] = React.useState<SortOption>("title");
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const filterAndSort = (list: Book[]) => {
    let result = [...list];

    // Filter
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (b) =>
          (b.title?.toLowerCase().includes(lower) || false) ||
          (b.authors?.toLowerCase().includes(lower) || false) ||
          (b.series?.toLowerCase().includes(lower) || false) ||
          (b.tags?.some((t) => t.toLowerCase().includes(lower)) || false),
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
      />

      <main id="main-content" className="flex-grow bg-base-100 p-4 sm:p-8">
        <div className="container mx-auto max-w-7xl">
          {connectedHost && (
            <div className="mb-4 p-3 bg-primary/5 border border-primary/10 rounded-lg flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="badge badge-success badge-xs gap-1 py-2 font-bold px-2">
                  <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
                  Live Sync
                </div>
                <div className="flex flex-col">
                  <p className="text-xs font-bold text-base-content/90 leading-none">
                    {connectedHost.hostname}
                  </p>
                  <p className="text-[10px] font-mono opacity-40">
                    {connectedHost.ip}:{connectedHost.port}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-[10px] font-bold text-primary uppercase tracking-wider opacity-60">
                  Connected
                </div>
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="btn btn-xs btn-ghost border border-base-300 gap-1"
                >
                  <WifiOff className="w-3 h-3" />
                  <span>Exit</span>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="alert alert-error mb-6 flex justify-between items-start">
              <div className="flex gap-2">
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
              <button
                type="button"
                onClick={clearError}
                className="btn btn-ghost btn-xs btn-circle"
              >
                ✕
              </button>
            </div>
          )}

          {loading ? (
            <div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
              aria-live="polite"
              aria-busy="true"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : connectedHost ? (
            <div className="flex flex-col gap-4">
              <div 
                className="sticky top-[72px] z-[900] bg-base-100/95 backdrop-blur-sm px-1 py-3 border-b border-base-200 flex flex-col gap-3 transition-shadow duration-300"
                style={{ boxShadow: showScrollTop ? "0 4px 6px -1px rgb(0 0 0 / 0.1)" : "none" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm sm:text-lg font-bold">Available Books</h2>
                      <span className="badge badge-primary badge-sm py-1 font-medium">
                        {books.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => refresh()}
                        className="btn btn-xs btn-circle btn-ghost"
                        title="Refresh Library"
                        disabled={loading}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectionMode(!selectionMode);
                        setSelectedIds(new Set());
                      }}
                      className={`btn btn-xs sm:btn-sm ${selectionMode ? "btn-primary" : "btn-ghost border-base-300"}`}
                    >
                      {selectionMode ? "Done" : "Select"}
                    </button>

                    <div className="flex items-center gap-1 bg-base-200 p-0.5 rounded-lg border border-base-300">
                      <button
                        type="button"
                        onClick={() => setViewMode("grid")}
                        className={`btn btn-xs btn-square ${viewMode === "grid" ? "btn-primary" : "btn-ghost"}`}
                        title="Grid View"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("list")}
                        className={`btn btn-xs btn-square ${viewMode === "list" ? "btn-primary" : "btn-ghost"}`}
                        title="List View"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {selectionMode && (
                  <div className="flex items-center gap-2 bg-primary/10 p-2 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-top-2">
                    <span className="text-xs font-bold text-primary px-1">
                      {selectedIds.size} selected
                    </span>
                    <div className="flex gap-1 ml-auto">
                      <button
                        type="button"
                        className="btn btn-[10px] h-7 min-h-0 btn-ghost text-primary hover:bg-primary/20"
                        onClick={() => setSelectedIds(new Set(filteredRemoteBooks.map((b) => b.id)))}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="btn btn-[10px] h-7 min-h-0 btn-ghost text-primary hover:bg-primary/20"
                        onClick={() => setSelectedIds(new Set())}
                      >
                        None
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 w-full">
                  <div className="flex-1">
                    <SearchBar value={searchTerm} onChange={setSearchTerm} />
                  </div>
                  <div className="shrink-0">
                    <SortMenu value={sortOption} onChange={setSortOption} />
                  </div>
                </div>
              </div>

              <div className={`grid gap-3 sm:gap-4 ${
                viewMode === "grid" 
                  ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8" 
                  : "grid-cols-1 md:grid-cols-2"
              }`}>
                {filteredRemoteBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    host={connectedHost}
                    variant="remote"
                    compact={viewMode === "grid"}
                    onAction={handleSync}
                    selected={selectedIds.has(book.id)}
                    selectable={selectionMode}
                    onSelect={() => toggleSelection(book.id)}
                    syncStatus={syncProgress[book.id]}
                    actionLabel="Sync"
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
                        ? `No results for "${searchTerm}"`
                        : "Library is empty."
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
                  <h2 className="text-xl font-bold mb-4">On My Device</h2>
                  <div className={`grid gap-3 sm:gap-4 ${
                    viewMode === "grid" 
                      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" 
                      : "grid-cols-1 md:grid-cols-2"
                  }`}>
                    {filteredLocalBooks.map((book) => (
                      <BookCard
                        key={book.id}
                        book={book}
                        variant="local"
                        compact={viewMode === "grid"}
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
                  description="Connect to a host to browse books."
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-[2000] btn btn-circle btn-primary shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300"
          aria-label="Back to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

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
