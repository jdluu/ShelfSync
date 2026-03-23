import { ArrowUp } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";

import { BookDetailsModal } from "@/components/ui/BookDetailsModal";
import { CoverFlow } from "@/components/ui/CoverFlow";
import { QueueOverlay } from "@/components/ui/QueueOverlay";
import { Discovery } from "@/features/discovery/Discovery";
import type { Book } from "@/types/core";
import { ClientBookGrid } from "./ClientBookGrid";
import { ClientEmptyState } from "./ClientEmptyState";
import { ClientErrorBanner } from "./ClientErrorBanner";
import { ClientGroupedGrid } from "./ClientGroupedGrid";
import { ClientHeader } from "./ClientHeader";
import { ClientNoBooksFound } from "./ClientNoBooksFound";
import { ClientSkeletonGrid } from "./ClientSkeletonGrid";
import { ClientTabs } from "./ClientTabs";
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
    offlineStoragePath,
    selectOfflineStorageFolder,
    deleteLocalBook,
    startBulkDelete,
    activeTab,
    setActiveTab,
    collapsedGroups,
    toggleGroupCollapse,
  } = useClientDashboard();

  const [detailsBook, setDetailsBook] = useState<{ book: Book; coverUrl?: string } | null>(null);

  const handleInfoClick = (book: Book, coverUrl?: string) => {
    setDetailsBook({ book, coverUrl });
  };

  const isGroupSelected = (groupBooks: Book[]) =>
    groupBooks.length > 0 && groupBooks.every((b) => selectedIds.has(b.id));

  // Determine the correct labeling for group selection
  const getGroupSelectLabel = (isSelected: boolean) => {
    const prefix = isSelected ? "Deselect" : "Select";
    if (groupBy === "series") return `${prefix} Series`;
    if (groupBy === "author") return `${prefix} Author`;
    if (groupBy === "tag") return `${prefix} Tag`;
    return `${prefix} Group`;
  };

  return (
    <>
      <SkipLink />
      <Header title="Client Dashboard" onChangeRole={onChangeRole} />

      <main id="main-content" className="flex-grow bg-base-100 p-4 sm:p-8">
        <div className="container mx-auto max-w-6xl">
          <ClientHeader
            activeTab={activeTab}
            connectedHost={connectedHost}
            error={error || null}
            offlineStoragePath={offlineStoragePath}
            selectOfflineStorageFolder={selectOfflineStorageFolder}
            disconnect={disconnect}
            clearError={clearError}
          />

          <ClientTabs activeTab={activeTab} setActiveTab={setActiveTab} />

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
              bookCount={activeTab === "explore" ? books.length : localBooks.length}
              showScrollTop={showScrollTop}
              groupBy={groupBy}
              setGroupBy={setGroupBy}
            />
          )}

          <div className="mt-8">
            {activeTab === "explore" ? (
              <div className="flex flex-col gap-4">
                {error && <ClientErrorBanner error={error} clearError={clearError} />}

                {loading ? (
                  <ClientSkeletonGrid />
                ) : !connectedHost ? (
                  <Discovery onConnect={connect} />
                ) : books.length === 0 ? (
                  <ClientNoBooksFound refresh={refresh} />
                ) : groupedBooks ? (
                  <ClientGroupedGrid
                    groupedBooks={groupedBooks}
                    collapsedGroups={collapsedGroups}
                    toggleGroupCollapse={toggleGroupCollapse}
                    selectGroup={selectGroup}
                    getGroupSelectLabel={getGroupSelectLabel}
                    isGroupSelected={isGroupSelected}
                    viewMode={viewMode}
                    activeTab={activeTab}
                    connectedHost={connectedHost}
                    token={token}
                    selectedIds={selectedIds}
                    selectionMode={selectionMode}
                    syncProgress={syncProgress}
                    openLocalBook={openLocalBook}
                    syncBook={syncBook}
                    toggleSelection={toggleSelection}
                    handleToggleStatus={handleToggleStatus}
                    handleInfoClick={handleInfoClick}
                  />
                ) : (
                  <div className="animate-in fade-in duration-500 flex flex-col gap-8">
                    {viewMode === "grid" && !searchTerm && !sortOption.includes("title") && (
                      <div className="hidden sm:block w-full">
                        <CoverFlow
                          books={filteredRemoteBooks.slice(0, 10)}
                          title="Featured Books"
                          host={connectedHost}
                          token={token}
                          onInfoClick={handleInfoClick}
                        />
                        <h3 className="text-xl font-bold tracking-tight text-base-content mb-4 px-1">
                          All Books
                        </h3>
                      </div>
                    )}
                    <ClientBookGrid
                      books={filteredRemoteBooks}
                      viewMode={viewMode}
                      activeTab={activeTab}
                      connectedHost={connectedHost}
                      token={token}
                      selectedIds={selectedIds}
                      selectionMode={selectionMode}
                      syncProgress={syncProgress}
                      openLocalBook={openLocalBook}
                      syncBook={syncBook}
                      toggleSelection={toggleSelection}
                      handleToggleStatus={handleToggleStatus}
                      handleInfoClick={handleInfoClick}
                    />
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
                  <ClientEmptyState setActiveTab={setActiveTab} />
                ) : groupedBooks ? (
                  <ClientGroupedGrid
                    groupedBooks={groupedBooks}
                    collapsedGroups={collapsedGroups}
                    toggleGroupCollapse={toggleGroupCollapse}
                    selectGroup={selectGroup}
                    getGroupSelectLabel={getGroupSelectLabel}
                    isGroupSelected={isGroupSelected}
                    viewMode={viewMode}
                    activeTab={activeTab}
                    connectedHost={connectedHost}
                    token={token}
                    selectedIds={selectedIds}
                    selectionMode={selectionMode}
                    syncProgress={syncProgress}
                    openLocalBook={openLocalBook}
                    syncBook={syncBook}
                    toggleSelection={toggleSelection}
                    handleToggleStatus={handleToggleStatus}
                    handleInfoClick={handleInfoClick}
                  />
                ) : (
                  <div className="animate-in fade-in duration-500">
                    <ClientBookGrid
                      books={filteredLocalBooks}
                      viewMode={viewMode}
                      activeTab={activeTab}
                      connectedHost={connectedHost}
                      token={token}
                      selectedIds={selectedIds}
                      selectionMode={selectionMode}
                      syncProgress={syncProgress}
                      openLocalBook={openLocalBook}
                      syncBook={syncBook}
                      toggleSelection={toggleSelection}
                      handleToggleStatus={handleToggleStatus}
                      handleInfoClick={handleInfoClick}
                    />
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
          selectedBooks={(activeTab === "explore" ? books : localBooks).filter((b) =>
            selectedIds.has(b.id),
          )}
          selectAll={selectAll}
          selectNone={selectNone}
          onDeselect={toggleSelection}
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
            ? "Open File"
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
