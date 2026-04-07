import type React from "react";
import { BookCard } from "@/components/library/BookCard";
import { VirtualGrid } from "@/components/library/VirtualGrid";
import type { Book, Host } from "@/types/core";
import type { SyncProgress } from "@/types/library";

interface ClientBookGridProps {
  books: Book[];
  viewMode: "grid" | "list";
  activeTab: "explore" | "library";
  connectedHost: Host | null;
  token?: string;
  selectedIds: Set<number>;
  selectionMode: boolean;
  syncProgress: Record<number, SyncProgress>;
  openLocalBook: (path: string) => void;
  syncBook: (book: Book) => void;
  toggleSelection: (id: number) => void;
  handleToggleStatus: (book: Book) => void;
  handleInfoClick: (book: Book, coverUrl?: string) => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}

export const ClientBookGrid: React.FC<ClientBookGridProps> = ({
  books,
  viewMode,
  activeTab,
  connectedHost,
  token,
  selectedIds,
  selectionMode,
  syncProgress,
  openLocalBook,
  syncBook,
  toggleSelection,
  handleToggleStatus,
  handleInfoClick,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}) => {
  const isLocalTab = activeTab === "library";

  return (
    <VirtualGrid
      items={books}
      viewMode={viewMode}
      keyExtractor={(book) => book.id}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      fetchNextPage={fetchNextPage}
      itemComponent={({ item: book }) => (
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
          actionLabel={isLocalTab ? "Open File" : "Sync"}
          actionColor={isLocalTab ? "green" : "blue"}
        />
      )}
    />
  );
};
