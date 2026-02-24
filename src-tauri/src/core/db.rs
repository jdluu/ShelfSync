use crate::error::AppError;
use crate::models::Book;
use rusqlite::{Connection, OpenFlags};
use std::path::Path;

pub fn get_calibre_metadata(library_path: &str) -> Result<Vec<Book>, AppError> {
    let lib_path = Path::new(library_path);
    let db_path = lib_path.join("metadata.db");

    eprintln!("[DB] Checking Calibre library at: {:?}", lib_path);
    eprintln!("[DB] Metadata DB path exists: {}", db_path.exists());

    if !db_path.exists() {
        return Err(AppError::LibraryNotFound(library_path.to_string()));
    }

    let conn = match Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[DB] FATAL: Failed to open connection: {:?}", e);
            return Err(e.into());
        }
    };
    let _ = conn.execute("PRAGMA busy_timeout = 5000", []);

    // Quick check for total book count
    let total: i64 = match conn.query_row("SELECT count(*) FROM books", [], |r| r.get(0)) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("[DB] FATAL: Failed to count books: {:?}", e);
            return Err(e.into());
        }
    };
    eprintln!("[DB] Raw 'books' table count: {}", total);
    if total == 0 {
        return Ok(Vec::new());
    }

    let start = std::time::Instant::now();
    eprintln!("[DB] Preparing metadata query...");
    
    // Attempt the simplified query
    let mut stmt = match conn.prepare("SELECT id, title, path, series, series_index FROM books") {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[DB] PREPARE ERROR: {:?}. Attempting schema discovery...", e);
            // Discovery: What columns DO exist?
            if let Ok(mut info_stmt) = conn.prepare("PRAGMA table_info(books)") {
                let cols: Vec<String> = info_stmt.query_map([], |r| r.get::<_, String>(1))
                    .unwrap()
                    .filter_map(|r| r.ok())
                    .collect();
                eprintln!("[DB] Found columns in 'books' table: {:?}", cols);
            }
            // Fallback to absolute minimum
            eprintln!("[DB] Falling back to minimal query (id, title, path)...");
            match conn.prepare("SELECT id, title, path FROM books") {
                Ok(s) => s,
                Err(e2) => {
                    eprintln!("[DB] FATAL: Even minimal query failed: {:?}", e2);
                    return Err(e2.into());
                }
            }
        }
    };

    eprintln!("[DB] Statement ready. Starting fetch...");

    let book_iter = stmt.query_map([], |row| {
        Ok(Book {
            id: row.get(0)?,
            title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Unknown Title".to_string()),
            path: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            authors: "Loading...".to_string(),
            cover_url: None,
            formats: Vec::new(),
            series: None, // Simplified
            series_index: 0.0,
            tags: Vec::new(),
            publisher: None,
        })
    })?;

    let mut books = Vec::new();
    let mut errors = 0;
    for (i, book_res) in book_iter.enumerate() {
        let idx = i + 1;
        if i < 5 || idx % 100 == 0 || idx == (total as usize) {
            eprintln!("[DB] Row {}/{} loaded...", idx, total);
        }
        match book_res {
            Ok(book) => {
                books.push(book);
            }
            Err(e) => {
                if errors < 10 {
                    eprintln!("[DB] ROW ERROR index {}: {:?}", i, e);
                }
                errors += 1;
            }
        }
    }

    if errors > 0 {
        eprintln!("[DB] Finished processing with {} row errors.", errors);
    }
    eprintln!("[DB] SUCCESSFULLY loaded {} basic records in {:?}.", books.len(), start.elapsed());
    
    // Now try to fetch formats for the books
    eprintln!("[DB] Gracefully fetching supplemental metadata...");
    for b in &mut books {
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
    }
    eprintln!("[DB] Supplemental metadata loaded.");

    Ok(books)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::tempdir;

    fn create_mock_calibre_db(path: &Path) {
        let conn = Connection::open(path.join("metadata.db")).unwrap();
        // Minimal schema for tests
        conn.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, series INTEGER, series_index REAL)", []).unwrap();
        conn.execute("CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE TABLE books_authors_link (id INTEGER PRIMARY KEY, book INTEGER, author INTEGER)", []).unwrap();
        conn.execute("CREATE TABLE data (id INTEGER PRIMARY KEY, book INTEGER, format TEXT)", []).unwrap();

        conn.execute("INSERT INTO books (id, title, path) VALUES (1, 'Test Book 1', 'path1')", []).unwrap();
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
    }
}
