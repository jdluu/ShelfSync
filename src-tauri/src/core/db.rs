use crate::error::AppError;
use crate::models::Book;
use rusqlite::{Connection, OpenFlags};
use std::path::Path;

/**
 * Fetches book metadata from a Calibre library database.
 * 
 * @summary Queries the Calibre `metadata.db` for book details, authors, and formats.
 * @param library_path - The absolute path to the Calibre library directory.
 * @returns {Result<Vec<Book>, AppError>} A list of Book structures or an error if the DB is inaccessible.
 */
pub fn get_calibre_metadata(library_path: &str) -> Result<Vec<Book>, AppError> {
    let lib_path = Path::new(library_path);
    let db_path = lib_path.join("metadata.db");

    log::info!("Accessing Calibre library at: {:?}", lib_path);

    if !db_path.exists() {
        return Err(AppError::LibraryNotFound(library_path.to_string()));
    }

    // Open in read-only mode with a busy timeout for safety
    let conn = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let _ = conn.execute("PRAGMA busy_timeout = 5000", []);

    // 1. Get total book count
    let total: i64 = conn.query_row("SELECT count(*) FROM books", [], |r| r.get(0))?;
    if total == 0 {
        return Ok(Vec::new());
    }

    let start = std::time::Instant::now();
    
    // 2. Fetch basic metadata
    // Note: We avoid joining 'series' here because some Calibre schemas lack the 'series' column in 'books'
    let mut stmt = conn.prepare("SELECT id, title, path, series_index FROM books")?;

    let book_iter = stmt.query_map([], |row| {
        Ok(Book {
            id: row.get(0)?,
            title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Unknown Title".to_string()),
            path: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            authors: String::new(), // Populated in step 3
            cover_url: None,
            formats: Vec::new(),    // Populated in step 3
            series: None,
            series_index: row.get::<_, Option<f64>>(3)?.unwrap_or(1.0),
            tags: Vec::new(),
            publisher: None,
        })
    })?;

    let mut books = Vec::new();
    for book_res in book_iter {
        if let Ok(book) = book_res {
            books.push(book);
        }
    }

    // 3. Supplemental metadata (Authors and Formats)
    // We fetch these individually to ensure compatibility with various Calibre DB versions
    for b in &mut books {
        // Authors
        if let Ok(mut auth_stmt) = conn.prepare("SELECT a.name FROM authors a JOIN books_authors_link bal ON a.id = bal.author WHERE bal.book = ?") {
             if let Ok(mut rows) = auth_stmt.query([b.id]) {
                let mut names = Vec::new();
                while let Ok(Some(row)) = rows.next() {
                    if let Ok(n) = row.get::<_, String>(0) {
                        names.push(n);
                    }
                }
                if !names.is_empty() {
                    b.authors = names.join(", ");
                }
            }
        }
        // Formats
        if let Ok(mut fmt_stmt) = conn.prepare("SELECT format FROM data WHERE book = ?") {
            if let Ok(mut rows) = fmt_stmt.query([b.id]) {
                while let Ok(Some(row)) = rows.next() {
                    if let Ok(f) = row.get::<_, String>(0) {
                        b.formats.push(f);
                    }
                }
            }
        }
    }

    log::info!("Successfully loaded {} books in {:?}.", books.len(), start.elapsed());
    Ok(books)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::tempdir;

    fn create_mock_calibre_db(path: &Path) {
        let conn = Connection::open(path.join("metadata.db")).unwrap();
        conn.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, series_index REAL)", []).unwrap();
        conn.execute("CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE TABLE books_authors_link (id INTEGER PRIMARY KEY, book INTEGER, author INTEGER)", []).unwrap();
        conn.execute("CREATE TABLE data (id INTEGER PRIMARY KEY, book INTEGER, format TEXT)", []).unwrap();

        conn.execute("INSERT INTO books (id, title, path, series_index) VALUES (1, 'Test Book 1', 'path1', 1.0)", []).unwrap();
        conn.execute("INSERT INTO authors (id, name) VALUES (1, 'Author 1')", []).unwrap();
        conn.execute("INSERT INTO books_authors_link (book, author) VALUES (1, 1)", []).unwrap();
    }

    #[test]
    fn test_get_calibre_metadata() {
        let dir = tempdir().unwrap();
        create_mock_calibre_db(dir.path());
        let books = get_calibre_metadata(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].title, "Test Book 1");
        assert_eq!(books[0].authors, "Author 1");
    }
}
