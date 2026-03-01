import { ArrowUp, Search, WifiOff } from "lucide-react";
import type React from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { BookCard } from "@/components/library/BookCard";
import { VirtualGrid } from "@/components/library/VirtualGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueueOverlay } from "@/components/ui/QueueOverlay";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Discovery } from "@/features/discovery/Discovery";
import { ClientToolbar } from "./ClientToolbar";
import { SelectionOverlay } from "./SelectionOverlay";
import { useClientDashboard } from "./useClientDashboard";

interface ClientDashboardProps {
  onChangeRole: () => void;
}

/**
 * Client-side dashboard for browsing, selecting, and syncing books from a host.
 *
 * Renders the connection banner, book grid/list, offline library,
 * and delegates toolbar/selection logic to sub-components.
 */
export const ClientDashboard: React.FC<ClientDashboardProps> = ({ onChangeRole }) => {
  const {
    connectedHost,
    connect,
    disconnect,
    books,
    loading,
    error,
    clearError,
    refresh,
    syncBook,
    openLocalBook,
    handleToggleStatus,
    syncProgress,
    searchTerm,
    setSearchTerm,
    sortOption,
    setSortOption,
    selectionMode,
    setSelectionMode,
    selectedIds,
    viewMode,
    setViewMode,
    showScrollTop,
    filteredRemoteBooks,
    filteredLocalBooks,
    localBooks,
    toggleSelection,
    selectAll,
    selectNone,
    startBulkSync,
  } = useClientDashboard();

  return (
    <>
      <SkipLink />
      <Header title="Client Dashboard" onChangeRole={onChangeRole} />

      <main id="main-content" className="flex-grow bg-base-100 p-4 sm:p-8">
        <div className="container mx-auto max-w-7xl">
          {/* Connection banner */}
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
                  <p className="text-[10px] font-mono opacity-50">
                    {connectedHost.ip}:{connectedHost.port}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-[10px] font-bold text-primary uppercase tracking-wider opacity-70">
                  Connected
                </div>
                <button
                  type="button"
                  onClick={disconnect}
                  className="btn btn-xs btn-ghost border border-base-300 gap-1"
                  aria-label="Disconnect from host"
                >
                  <WifiOff className="w-3 h-3" />
                  <span>Exit</span>
                </button>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div role="alert" className="alert alert-error mb-6 flex justify-between items-start">
              <div className="flex gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="stroke-current shrink-0 h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
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
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
              aria-live="polite"
              aria-busy="true"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <SkeletonCard key={`skeleton-card-${i.toString()}`} />
              ))}
            </div>
          ) : connectedHost ? (
            <div className="flex flex-col gap-4">
              <ClientToolbar
                refresh={refresh}
                loading={loading}
                selectionMode={selectionMode}
                toggleSelectionMode={() => {
                  setSelectionMode(!selectionMode);
                }}
                viewMode={viewMode}
                setViewMode={setViewMode}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                sortOption={sortOption}
                setSortOption={setSortOption}
                selectedCount={selectedIds.size}
                selectAll={selectAll}
                selectNone={selectNone}
                bookCount={books.length}
                showScrollTop={showScrollTop}
              />

              {/* Book grid */}
              <div className="w-full">
                <VirtualGrid
                  items={filteredRemoteBooks}
                  viewMode={viewMode}
                  keyExtractor={(book) => book.id}
                  renderItem={(book) => (
                    <BookCard
                      book={book}
                      host={connectedHost}
                      variant="remote"
                      compact={viewMode === "grid"}
                      onAction={() => syncBook(book)}
                      selected={selectedIds.has(book.id)}
                      selectable={selectionMode}
                      onSelect={() => toggleSelection(book.id)}
                      syncStatus={syncProgress[book.id]}
                      actionLabel="Sync"
                      actionColor="blue"
                    />
                  )}
                />
              </div>

              {/* Empty search results */}
              {connectedHost && filteredRemoteBooks.length === 0 && !loading && (
                <div className="py-12">
                  <EmptyState
                    icon={Search}
                    title="No Books Found"
                    description={
                      searchTerm ? `No results for "${searchTerm}"` : "Library is empty."
                    }
                    actionLabel={searchTerm ? "Clear Search" : undefined}
                    onAction={() => setSearchTerm("")}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-12">
              <Discovery onConnect={connect} />

              {localBooks.length > 0 && (
                <div className="pt-8 border-t border-base-300">
                  <h2 className="text-xl font-bold mb-4">On My Device</h2>
                  <div className="w-full">
                    <VirtualGrid
                      items={filteredLocalBooks}
                      viewMode={viewMode}
                      keyExtractor={(book) => book.id}
                      renderItem={(book) => (
                        <BookCard
                          book={book}
                          variant="local"
                          compact={viewMode === "grid"}
                          onAction={() => book.local_path && openLocalBook(book.local_path)}
                          onToggleStatus={() => handleToggleStatus(book)}
                          actionLabel="Read"
                          actionColor="green"
                        />
                      )}
                    />
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

      {/* Scroll-to-top */}
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

      {/* Selection overlay */}
      {selectionMode && (
        <SelectionOverlay
          selectedCount={selectedIds.size}
          selectAll={selectAll}
          selectNone={selectNone}
          onBulkSync={startBulkSync}
        />
      )}

      <QueueOverlay progress={syncProgress} />
      <Footer />
    </>
  );
};
