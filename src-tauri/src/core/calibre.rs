use crate::error::AppError;
use crate::models::Book;
use rusqlite::{params, Connection};
use std::path::Path;

/// Ensures that a valid (minimal) Calibre metadata.db exists in the given root path.
pub fn ensure_calibre_db(root_path: &Path) -> Result<(), AppError> {
    let db_path = root_path.join("metadata.db");
    let conn = Connection::open(db_path)?;

    // Minimal Calibre schema for compatibility
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'Unknown',
            sort TEXT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            pubdate TEXT DEFAULT CURRENT_TIMESTAMP,
            series_index REAL DEFAULT 1.0,
            author_sort TEXT,
            isbn TEXT DEFAULT '',
            lccn TEXT DEFAULT '',
            path TEXT NOT NULL DEFAULT '',
            flags INTEGER NOT NULL DEFAULT 1,
            uuid TEXT,
            has_cover BOOL DEFAULT 0,
            last_modified TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS authors (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            sort TEXT,
            link TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS books_authors_link (
            id INTEGER PRIMARY KEY,
            book INTEGER NOT NULL,
            author INTEGER NOT NULL,
            UNIQUE(book, author)
        );
        CREATE TABLE IF NOT EXISTS data (
            id INTEGER PRIMARY KEY,
            book INTEGER NOT NULL,
            format TEXT NOT NULL,
            uncompressed_size INTEGER NOT NULL DEFAULT 0,
            name TEXT NOT NULL,
            UNIQUE(book, format)
        );
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            UNIQUE(name)
        );
        CREATE TABLE IF NOT EXISTS books_tags_link (
            id INTEGER PRIMARY KEY,
            book INTEGER NOT NULL,
            tag INTEGER NOT NULL,
            UNIQUE(book, tag)
        );
        CREATE TABLE IF NOT EXISTS series (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            sort TEXT,
            UNIQUE(name)
        );
        CREATE TABLE IF NOT EXISTS books_series_link (
            id INTEGER PRIMARY KEY,
            book INTEGER NOT NULL,
            series INTEGER NOT NULL,
            UNIQUE(book)
        );
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY,
            book INTEGER NOT NULL,
            text TEXT NOT NULL,
            UNIQUE(book)
        );
        CREATE TABLE IF NOT EXISTS ratings (
            id INTEGER PRIMARY KEY,
            rating INTEGER NOT NULL,
            UNIQUE(rating)
        );
        CREATE TABLE IF NOT EXISTS books_ratings_link (
            id INTEGER PRIMARY KEY,
            book INTEGER NOT NULL,
            rating INTEGER NOT NULL,
            UNIQUE(book, rating)
        );
        CREATE TABLE IF NOT EXISTS languages (
            id INTEGER PRIMARY KEY,
            lang_code TEXT NOT NULL,
            UNIQUE(lang_code)
        );
        CREATE TABLE IF NOT EXISTS books_languages_link (
            id INTEGER PRIMARY KEY,
            book INTEGER NOT NULL,
            item INTEGER NOT NULL,
            UNIQUE(book, item)
        );
        CREATE TABLE IF NOT EXISTS publishers (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            sort TEXT,
            UNIQUE(name)
        );
        CREATE TABLE IF NOT EXISTS books_publishers_link (
            id INTEGER PRIMARY KEY,
            book INTEGER NOT NULL,
            publisher INTEGER NOT NULL,
            UNIQUE(book)
        );
    ")?;

    Ok(())
}

/// Syncs a book's metadata into the Calibre metadata.db at the given root path.
pub fn sync_book_to_calibre_db(root_path: &Path, book: &Book) -> Result<(), AppError> {
    ensure_calibre_db(root_path)?;
    let db_path = root_path.join("metadata.db");
    let mut conn = Connection::open(db_path)?;
    let tx = conn.transaction()?;

    // 1. Authors
    let mut author_ids = Vec::new();
    for author_name in book.authors.split(',') {
        let name = author_name.trim();
        if name.is_empty() { continue; }
        tx.execute(
            "INSERT OR IGNORE INTO authors (name, sort) VALUES (?1, ?1)",
            params![name],
        )?;
        let id: i64 = tx.query_row(
            "SELECT id FROM authors WHERE name = ?1",
            params![name],
            |r| r.get(0),
        )?;
        author_ids.push(id);
    }

    // 2. Book
    // Note: We use the remote_id as the ID in the destination DB if possible, 
    // or let it auto-increment if we wanted. But for true sync, we use book.id.
    // However, Calibre IDs are local. To avoid collisions, we'll use an UPSERT.
    tx.execute(
        "INSERT INTO books (id, title, sort, author_sort, path, series_index, has_cover) 
         VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET 
            title=excluded.title, sort=excluded.sort, author_sort=excluded.author_sort, 
            path=excluded.path, series_index=excluded.series_index, has_cover=excluded.has_cover",
        params![
            book.id, 
            book.title, 
            book.authors, 
            book.path, 
            book.series_index,
            book.cover_url.is_some()
        ],
    )?;

    // 3. Author Links
    tx.execute("DELETE FROM books_authors_link WHERE book = ?1", params![book.id])?;
    for aid in author_ids {
        tx.execute(
            "INSERT INTO books_authors_link (book, author) VALUES (?1, ?2)",
            params![book.id, aid],
        )?;
    }

    // 4. Series
    if let Some(sname) = &book.series {
        tx.execute("INSERT OR IGNORE INTO series (name, sort) VALUES (?1, ?1)", params![sname])?;
        let sid: i64 = tx.query_row("SELECT id FROM series WHERE name = ?1", params![sname], |r| r.get(0))?;
        tx.execute(
            "INSERT INTO books_series_link (book, series) VALUES (?1, ?2) ON CONFLICT(book) DO UPDATE SET series=excluded.series",
            params![book.id, sid],
        )?;
    }

    // 5. Tags
    tx.execute("DELETE FROM books_tags_link WHERE book = ?1", params![book.id])?;
    for tag in &book.tags {
        tx.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", params![tag])?;
        let tid: i64 = tx.query_row("SELECT id FROM tags WHERE name = ?1", params![tag], |r| r.get(0))?;
        tx.execute("INSERT INTO books_tags_link (book, tag) VALUES (?1, ?2)", params![book.id, tid])?;
    }

    // 6. Data (File format)
    // We assume the synced file is the primary data.
    let file_name = Path::new(&book.path).file_stem().and_then(|s| s.to_str()).unwrap_or("book");
    tx.execute(
        "INSERT INTO data (book, format, name) VALUES (?1, ?2, ?3) ON CONFLICT(book, format) DO UPDATE SET name=excluded.name",
        params![book.id, "EPUB", file_name],
    )?;

    // 7. Comments (Description)
    if let Some(desc) = &book.description {
        tx.execute(
            "INSERT INTO comments (book, text) VALUES (?1, ?2) ON CONFLICT(book) DO UPDATE SET text=excluded.text",
            params![book.id, desc],
        )?;
    }

    // 8. Publisher
    if let Some(pub_name) = &book.publisher {
        tx.execute("INSERT OR IGNORE INTO publishers (name, sort) VALUES (?1, ?1)", params![pub_name])?;
        let pid: i64 = tx.query_row("SELECT id FROM publishers WHERE name = ?1", params![pub_name], |r| r.get(0))?;
        tx.execute(
            "INSERT INTO books_publishers_link (book, publisher) VALUES (?1, ?2) ON CONFLICT(book) DO UPDATE SET publisher=excluded.publisher",
            params![book.id, pid],
        )?;
    }

    // 9. Rating
    if let Some(rating) = book.rating {
        tx.execute("INSERT OR IGNORE INTO ratings (rating) VALUES (?1)", params![rating as i64])?;
        let rid: i64 = tx.query_row("SELECT id FROM ratings WHERE rating = ?1", params![rating as i64], |r| r.get(0))?;
        tx.execute(
            "INSERT INTO books_ratings_link (book, rating) VALUES (?1, ?2) ON CONFLICT(book, rating) DO NOTHING",
            params![book.id, rid],
        )?;
    }

    // 10. Language
    if let Some(lang) = &book.language {
        tx.execute("INSERT OR IGNORE INTO languages (lang_code) VALUES (?1)", params![lang])?;
        let lid: i64 = tx.query_row("SELECT id FROM languages WHERE lang_code = ?1", params![lang], |r| r.get(0))?;
        tx.execute(
            "INSERT INTO books_languages_link (book, item) VALUES (?1, ?2) ON CONFLICT(book, item) DO NOTHING",
            params![book.id, lid],
        )?;
    }

    tx.commit()?;
    Ok(())
}
