import Database from "@tauri-apps/plugin-sql";
import type { Book } from "@/types/core";

const DB_NAME = "shelfsync_client.db";

let dbInstance: Database | null = null;

/**
 * Retrieves the database instance, loading it from disk if necessary.
 * @returns The active Database instance.
 */
export async function getDB(): Promise<Database> {
  if (dbInstance) return dbInstance;
  dbInstance = await Database.load(`sqlite:${DB_NAME}`);
  return dbInstance;
}

/**
 * Initializes the local SQLite database by creating necessary tables and running migrations.
 */
export async function initDB() {
  const db = await getDB();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      authors TEXT NOT NULL,
      remote_id INTEGER,
      format TEXT,
      local_path TEXT,
      read_status TEXT DEFAULT 'unread'
    )
  `);

  // Migration for existing tables: Try to add column if it's missing.
  // We swallow the error if it already exists.
  try {
    await db.execute("ALTER TABLE books ADD COLUMN read_status TEXT DEFAULT 'unread'");
  } catch (e: unknown) {
    const msg = String(e).toLowerCase();
    // SQLite error for duplicate column usually contains "duplicate column name"
    if (!msg.includes("duplicate column name")) {
      console.error("Migration failed:", e);
      throw e;
    }
  }
}

/**
 * Persists a book's metadata and local path to the client database.
 * @param book The book metadata to save.
 * @param localPath The local filesystem path where the book is stored.
 */
export async function saveBook(book: Book, localPath: string) {
  const db = await getDB();
  // Using simplified logic for now: simple insert
  // In reality we should upsert based on remote_id
  await db.execute(
    "INSERT INTO books (title, authors, remote_id, format, local_path, read_status) VALUES ($1, $2, $3, $4, $5, $6)",
    [book.title, book.authors, book.id, "epub", localPath, "unread"],
  );
}

/**
 * Updates the reading status of a specific book.
 * @param id The ID of the book in the local database.
 * @param status The new reading status.
 */
export async function updateReadStatus(id: number, status: "unread" | "reading" | "finished") {
  const db = await getDB();
  await db.execute("UPDATE books SET read_status = $1 WHERE id = $2", [status, id]);
}

interface BookRow {
  id: number;
  title: string;
  authors: string;
  local_path: string;
  remote_id: number | null;
  format: string | null;
  read_status: "unread" | "reading" | "finished" | null;
}

/**
 * Retrieves all books stored in the local client database.
 * @returns A promise resolving to an array of Book objects.
 */
export async function getLocalBooks(): Promise<Book[]> {
  const db = await getDB();
  const rows = await db.select<BookRow[]>("SELECT * FROM books");
  return rows.map((row) => ({
    id: row.id, // local ID
    title: row.title,
    authors: row.authors,
    path: row.local_path, // Satisfy Book interface
    local_path: row.local_path,
    remote_id: row.remote_id ?? undefined,
    format: row.format ?? undefined,
    read_status: row.read_status || "unread",
  }));
}
