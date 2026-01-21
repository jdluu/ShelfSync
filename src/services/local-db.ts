import Database from "@tauri-apps/plugin-sql";
import { Book } from "@/types";

const DB_NAME = "shelfsync_client.db";

let dbInstance: Database | null = null;

export async function getDB(): Promise<Database> {
  if (dbInstance) return dbInstance;
  dbInstance = await Database.load(`sqlite:${DB_NAME}`);
  return dbInstance;
}

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
  } catch (e) {
      // Column likely already exists
  }
}

export async function saveBook(book: Book, localPath: string) {
  const db = await getDB();
  // Using simplified logic for now: simple insert
  // In reality we should upsert based on remote_id
  await db.execute(
    "INSERT INTO books (title, authors, remote_id, format, local_path, read_status) VALUES ($1, $2, $3, $4, $5, $6)",
    [book.title, book.authors, book.id, "epub", localPath, "unread"]
  );
}

export async function updateReadStatus(id: number, status: 'unread' | 'reading' | 'finished') {
    const db = await getDB();
    await db.execute("UPDATE books SET read_status = $1 WHERE id = $2", [status, id]);
}

export async function getLocalBooks(): Promise<Book[]> {
  const db = await getDB();
  const rows = await db.select<any[]>("SELECT * FROM books");
  return rows.map((row: any) => ({
    id: row.id, // local ID
    title: row.title,
    authors: row.authors, 
    path: row.local_path, // Satisfy Book interface
    local_path: row.local_path,
    remote_id: row.remote_id,
    format: row.format,
    read_status: row.read_status || 'unread'
  }));
}
