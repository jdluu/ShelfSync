import type { Book } from "@/types/core";
import { safeInvoke } from "@/utils/tauri";

/**
 * Initializes the local database by calling the Rust backend.
 */
export async function initDB() {
  await safeInvoke<void>("init_local_db", {});
}

/**
 * Persists a book's metadata and local path to the client database via Rust.
 * @param book The book metadata to save.
 * @param localPath The local filesystem path where the book is stored.
 */
export async function saveBook(book: Book, localPath: string) {
  await safeInvoke<void>("save_local_book", { book, localPath });
}

/**
 * Updates the reading status of a specific book via Rust.
 * @param id The ID of the book in the local database.
 * @param status The new reading status.
 */
export async function updateReadStatus(id: number, status: "unread" | "reading" | "finished") {
  await safeInvoke<void>("update_local_read_status", { id, status });
}

/**
 * Retrieves all books stored in the local client database via Rust.
 * @returns A promise resolving to an array of Book objects.
 */
export async function getLocalBooks(): Promise<Book[]> {
  return (await safeInvoke<Book[]>("get_local_books", {})) ?? [];
}
/**
 * Deletes a book from the local database and removes its file via Rust.
 * @param id The ID of the book in the local database.
 */
export async function deleteBook(id: number) {
  await safeInvoke<void>("delete_local_book", { id });
}
