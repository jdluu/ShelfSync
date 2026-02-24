import { invoke } from "@tauri-apps/api/core";
import type { Book } from "@/types/core";

/**
 * Initializes the local database by calling the Rust backend.
 */
export async function initDB() {
  await invoke("init_local_db");
}

/**
 * Persists a book's metadata and local path to the client database via Rust.
 * @param book The book metadata to save.
 * @param localPath The local filesystem path where the book is stored.
 */
export async function saveBook(book: Book, localPath: string) {
  await invoke("save_local_book", { book, localPath });
}

/**
 * Updates the reading status of a specific book via Rust.
 * @param id The ID of the book in the local database.
 * @param status The new reading status.
 */
export async function updateReadStatus(id: number, status: "unread" | "reading" | "finished") {
  await invoke("update_local_read_status", { id, status });
}

/**
 * Retrieves all books stored in the local client database via Rust.
 * @returns A promise resolving to an array of Book objects.
 */
export async function getLocalBooks(): Promise<Book[]> {
  return await invoke<Book[]>("get_local_books");
}
