import { ArrowUp, BookOpen, Library, Search, WifiOff } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { BookCard } from "@/components/library/BookCard";
import { VirtualGrid } from "@/components/library/VirtualGrid";
import { BookDetailsModal } from "@/components/ui/BookDetailsModal";
import { QueueOverlay } from "@/components/ui/QueueOverlay";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Discovery } from "@/features/discovery/Discovery";
import type { Book } from "@/types/core";
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
    token,
    groupBy,
    setGroupBy,
    groupedBooks,
    selectGroup,
    syncGroup,
    offlineStoragePath,
    selectOfflineStorageFolder,
    deleteLocalBook,
    startBulkDelete,
    activeTab,
    setActiveTab,
  } = useClientDashboard();

  const [detailsBook, setDetailsBook] = useState<{ book: Book; coverUrl?: string } | null>(null);

  const handleInfoClick = (book: Book, coverUrl?: string) => {
    setDetailsBook({ book, coverUrl });
  };

  // Unified book rendering helper
  const renderBookGrid = (booksToRender: Book[]) => (
    <VirtualGrid
      items={booksToRender}
      viewMode={viewMode}
      keyExtractor={(book) => book.id}
      renderItem={(book) => {
        const isLocalTab = activeTab === "library";
        return (
          <BookCard
            book={book}
            host={isLocalTab ? undefined : connectedHost}
            token={isLocalTab ? undefined : token || undefined}
            variant={isLocalTab ? "local" : "remote"}
            compact={viewMode === "grid"}
            onAction={() => {
              if (isLocalTab && book.local_path) {
                openLocalBook(book.local_path);
              } else if (!isLocalTab) {
                syncBook(book);
              }
            }}
            onInfoClick={handleInfoClick}
            selected={selectedIds.has(book.id)}
            selectable={selectionMode}
            onSelect={() => toggleSelection(book.id)}
            onToggleStatus={isLocalTab ? () => handleToggleStatus(book) : undefined}
            syncStatus={!isLocalTab ? syncProgress[book.id] : undefined}
            actionLabel={isLocalTab ? "Read" : "Sync"}
            actionColor={isLocalTab ? "green" : "blue"}
          />
        );
      }}
    />
  );

  return (
    <>
      <SkipLink />
      <Header title="Client Dashboard" onChangeRole={onChangeRole} />

      <main id="main-content" className="flex-grow bg-base-100 p-4 sm:p-8">
        <div className="container mx-auto max-w-7xl">
          {/* Storage Path Prompt - Only show when relevant */}
          {!offlineStoragePath && (activeTab === "library" || connectedHost) && (
            <div className="mb-4 p-4 bg-warning/10 border border-warning/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
                  <Search className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm font-bold text-base-content">Set Download Location</p>
                  <p className="text-xs text-base-content/60">
                    Choose where to save your books before syncing.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={selectOfflineStorageFolder}
                className="btn btn-warning btn-sm w-full sm:w-auto"
              >
                Select Folder
              </button>
            </div>
          )}

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

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 bg-base-200 p-1 rounded-xl mb-6 shadow-sm border border-base-300 w-full xs:w-fit">
            <button
              onClick={() => setActiveTab("explore")}
              className={`flex-1 xs:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                activeTab === "explore"
                  ? "bg-primary text-primary-content shadow-md"
                  : "hover:bg-base-300 text-base-content/60"
              }`}
            >
              Explore
            </button>
            <button
              onClick={() => setActiveTab("library")}
              className={`flex-1 xs:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
                activeTab === "library"
                  ? "bg-primary text-primary-content shadow-md"
                  : "hover:bg-base-300 text-base-content/60"
              }`}
            >
              My Library
            </button>
          </div>

          {/* Toolbar - Only show when there is something to filter/sort/group */}
          {((activeTab === "explore" && connectedHost) ||
            (activeTab === "library" && localBooks.length > 0)) && (
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
              bookCount={activeTab === "explore" ? books.length : localBooks.length}
              showScrollTop={showScrollTop}
              groupBy={groupBy}
              setGroupBy={setGroupBy}
            />
          )}

          <div className="mt-8">
            {activeTab === "explore" ? (
              <div className="flex flex-col gap-4">
                {error && (
                  <div
                    role="alert"
                    className="alert alert-error mb-6 flex justify-between items-start"
                  >
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
                    >
                      ✕
                    </button>
                  </div>
                )}

                {loading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <SkeletonCard key={`skeleton-card-${i.toString()}`} />
                    ))}
                  </div>
                ) : !connectedHost ? (
                  <Discovery onConnect={connect} />
                ) : books.length === 0 ? (
                  <div className="text-center py-20 px-4 bg-base-200/30 rounded-3xl border border-dashed border-base-300">
                    <BookOpen className="w-16 h-16 mx-auto mb-4 text-base-content/10" />
                    <h3 className="text-xl font-bold mb-2">No books found</h3>
                    <p className="text-base-content/50 max-w-xs mx-auto text-sm">
                      The host doesn't seem to have any books in the selected library folder.
                    </p>
                    <button type="button" onClick={refresh} className="btn btn-primary mt-6">
                      Refresh Library
                    </button>
                  </div>
                ) : groupedBooks ? (
                  <div className="space-y-12">
                    {[...groupedBooks.entries()].map(([groupName, groupBooks]) => (
                      <section
                        key={groupName}
                        className="animate-in fade-in slide-in-from-bottom-4 duration-500"
                      >
                        <div className="flex items-center justify-between mb-6 px-1">
                          <div className="flex items-center gap-3">
                            <h3 className="text-xl font-bold tracking-tight">{groupName}</h3>
                            <span className="badge badge-ghost font-mono text-[10px] opacity-50">
                              {groupBooks.length} items
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn btn-xs btn-ghost text-primary"
                              onClick={() => selectGroup(groupBooks)}
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-primary btn-outline"
                              onClick={() => syncGroup(groupBooks)}
                            >
                              Sync All
                            </button>
                          </div>
                        </div>
                        {renderBookGrid(groupBooks)}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-500">
                    {renderBookGrid(filteredRemoteBooks)}
                  </div>
                )}
              </div>
            ) : (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-8 px-1">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-2xl font-black tracking-tight">My Library</h3>
                    <p className="text-xs text-base-content/50">Books downloaded to this device</p>
                  </div>
                  <div className="badge badge-primary font-bold">{localBooks.length} Items</div>
                </div>

                {localBooks.length === 0 ? (
                  <div className="text-center py-24 px-4 bg-base-200/30 rounded-3xl border border-dashed border-base-300">
                    <Library className="w-16 h-16 mx-auto mb-4 text-primary opacity-20" />
                    <h3 className="text-xl font-bold mb-2">Device library is empty</h3>
                    <p className="text-base-content/50 max-w-xs mx-auto text-sm">
                      Switch to the Explore tab to find and download books from your host.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab("explore")}
                      className="btn btn-primary btn-outline mt-8"
                    >
                      Browse Books
                    </button>
                  </div>
                ) : groupedBooks ? (
                  <div className="space-y-12">
                    {[...groupedBooks.entries()].map(([groupName, groupBooks]) => (
                      <section
                        key={groupName}
                        className="animate-in fade-in slide-in-from-bottom-4 duration-500"
                      >
                        <div className="flex items-center justify-between mb-6 px-1">
                          <div className="flex items-center gap-3">
                            <h3 className="text-xl font-bold tracking-tight">{groupName}</h3>
                            <span className="badge badge-ghost font-mono text-[10px] opacity-50">
                              {groupBooks.length} items
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn btn-xs btn-ghost text-primary"
                              onClick={() => selectGroup(groupBooks)}
                            >
                              Select All
                            </button>
                          </div>
                        </div>
                        {renderBookGrid(groupBooks)}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-500">
                    {renderBookGrid(filteredLocalBooks)}
                  </div>
                )}
              </section>
            )}
          </div>
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
          onBulkSync={activeTab === "explore" ? startBulkSync : undefined}
          onBulkDelete={activeTab === "library" ? startBulkDelete : undefined}
          variant={activeTab === "explore" ? "sync" : "delete"}
        />
      )}

      <BookDetailsModal
        isOpen={!!detailsBook}
        onClose={() => setDetailsBook(null)}
        book={detailsBook?.book || null}
        coverUrl={detailsBook?.coverUrl}
        actionLabel={
          detailsBook?.book && localBooks.find((b) => b.id === detailsBook.book.id)
            ? "Read"
            : "Sync"
        }
        actionColor={
          detailsBook?.book && localBooks.find((b) => b.id === detailsBook.book.id)
            ? "green"
            : "primary"
        }
        onAction={(book) => {
          const isLocal = localBooks.find((b) => b.id === book.id);
          if (isLocal?.local_path) {
            openLocalBook(isLocal.local_path);
          } else {
            syncBook(book);
          }
          setDetailsBook(null);
        }}
        isDownloading={
          detailsBook?.book ? syncProgress[detailsBook.book.id]?.status === "downloading" : false
        }
        onDelete={(book) => {
          deleteLocalBook(book);
          setDetailsBook(null);
        }}
      />

      <QueueOverlay progress={syncProgress} />
      <Footer />
    </>
  );
};
