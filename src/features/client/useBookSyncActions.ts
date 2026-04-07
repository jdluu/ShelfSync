import { useLibraryStore } from "@/store/libraryStore";
import { useSyncStore } from "@/store/syncStore";
import type { Book, Host } from "@/types/core";

export function useBookSyncActions(
  connectedHost: Host | null,
  token: string | undefined,
  offlineStoragePath: string,
) {
  const { toggleReadStatus, deleteLocalBook } = useLibraryStore();
  const { syncBooks } = useSyncStore();

  const syncBook = async (book: Book) => {
    if (connectedHost && token) {
      await syncBooks([book], connectedHost, token, offlineStoragePath);
    }
  };

  const handleToggleStatus = (book: Book) => {
    return toggleReadStatus(book, connectedHost, token);
  };

  const startBulkSync = async (books: Book[], selectedIds: Set<number>, onComplete: () => void) => {
    const toSync = books.filter((b) => selectedIds.has(b.id));
    if (connectedHost && token) {
      await syncBooks(toSync, connectedHost, token, offlineStoragePath).catch((e) =>
        console.error("Batch sync failed:", e),
      );
    }
    onComplete();
  };

  const startBulkDelete = async (
    localBooks: Book[],
    selectedIds: Set<number>,
    onComplete: () => void,
  ) => {
    const toDelete = localBooks.filter((b) => selectedIds.has(b.id));
    for (const book of toDelete) {
      await deleteLocalBook(book).catch((e) => console.error("Failed to delete book:", e));
    }
    onComplete();
  };

  return {
    syncBook,
    handleToggleStatus,
    startBulkSync,
    startBulkDelete,
  };
}
