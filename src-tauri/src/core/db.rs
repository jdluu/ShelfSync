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

    let conn = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let _ = conn.execute("PRAGMA busy_timeout = 5000", []);

    // Quick check for total book count
    let total: i64 = conn.query_row("SELECT count(*) FROM books", [], |r| r.get(0))?;
    eprintln!("[DB] Raw 'books' table count: {}", total);
    if total == 0 {
        return Ok(Vec::new());
    }

    let start = std::time::Instant::now();
    eprintln!("[DB] Executing simplified metadata query...");
    
    // Minimal query to avoid join/subquery issues during debugging
    let mut stmt = conn.prepare(
        "SELECT id, title, path, series, series_index FROM books"
    )?;

    eprintln!("[DB] Statement prepared. Starting iteration...");

    let book_iter = stmt.query_map([], |row| {
        Ok(Book {
            id: row.get(0)?,
            title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Unknown Title".to_string()),
            path: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            authors: "Loading...".to_string(), // Simplified for now
            cover_url: None,
            formats: Vec::new(),
            series: row.get::<_, Option<String>>(3)?, // This might be an ID if not joined, but let's see if it works
            series_index: row.get::<_, Option<f64>>(4)?.unwrap_or(1.0),
            tags: Vec::new(),
            publisher: None,
        })
    })?;

    let mut books = Vec::new();
    let mut errors = 0;
    for (i, book_res) in book_iter.enumerate() {
        let idx = i + 1;
        if i < 5 || idx % 50 == 0 || idx == (total as usize) {
            eprintln!("[DB] Row {}/{} processing...", idx, total);
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
        eprintln!("[DB] Finished with {} row errors.", errors);
    }
    eprintln!("[DB] SUCCESSFULLY loaded {} basic records in {:?}.", books.len(), start.elapsed());
    
    // Now try to fetch formats for the books (common source of hangs)
    eprintln!("[DB] Fetching formats for {} books...", books.len());
    for b in &mut books {
        if let Ok(mut fmt_stmt) = conn.prepare("SELECT format FROM data WHERE book = ?") {
            let fmts: Vec<String> = fmt_stmt.query_map([b.id], |r| r.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            b.formats = fmts;
        }
    }
    eprintln!("[DB] Formats loaded.");

    // And authors
    eprintln!("[DB] Fetching authors for {} books...", books.len());
    for b in &mut books {
        if let Ok(mut auth_stmt) = conn.prepare("SELECT a.name FROM authors a JOIN books_authors_link bal ON a.id = bal.author WHERE bal.book = ?") {
            let authors: Vec<String> = auth_stmt.query_map([b.id], |r| r.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            if !authors.is_empty() {
                b.authors = authors.join(", ");
            }
        }
    }
    eprintln!("[DB] Authors loaded.");

    Ok(books)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::tempdir;

    fn create_mock_calibre_db(path: &Path) {
        let conn = Connection::open(path.join("metadata.db")).unwrap();

        conn.execute(
            "CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, series INTEGER, series_index REAL)",
            [],
        ).unwrap();

        conn.execute(
            "CREATE TABLE series (id INTEGER PRIMARY KEY, name TEXT)",
            [],
        )
        .unwrap();
        conn.execute("CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT)", [])
            .unwrap();
        conn.execute(
            "CREATE TABLE books_tags_link (id INTEGER PRIMARY KEY, book INTEGER, tag INTEGER)",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE publishers (id INTEGER PRIMARY KEY, name TEXT)",
            [],
        )
        .unwrap();
        conn.execute("CREATE TABLE books_publishers_link (id INTEGER PRIMARY KEY, book INTEGER, publisher INTEGER)", []).unwrap();
        conn.execute(
            "CREATE TABLE data (id INTEGER PRIMARY KEY, book INTEGER, format TEXT)",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE books_authors_link (id INTEGER PRIMARY KEY, book INTEGER, author INTEGER)",
            [],
        ).unwrap();

        // Insert mock data
        conn.execute("INSERT INTO books (id, title, path) VALUES (1, 'The Great Gatsby', 'fitzgerald/gatsby')", []).unwrap();
        conn.execute(
            "INSERT INTO authors (id, name) VALUES (1, 'F. Scott Fitzgerald')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO books_authors_link (book, author) VALUES (1, 1)",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO books (id, title, path) VALUES (2, '1984', 'orwell/1984')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO authors (id, name) VALUES (2, 'George Orwell')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO books_authors_link (book, author) VALUES (2, 2)",
            [],
        )
        .unwrap();
    }

    #[test]
    fn test_get_calibre_metadata() {
        let dir = tempdir().unwrap();
        create_mock_calibre_db(dir.path());

        let books = get_calibre_metadata(dir.path().to_str().unwrap()).unwrap();

        assert_eq!(books.len(), 2);
        assert_eq!(books[0].title, "The Great Gatsby");
        assert_eq!(books[0].authors, "F. Scott Fitzgerald");
        assert_eq!(books[1].title, "1984");
        assert_eq!(books[1].authors, "George Orwell");
    }

    #[test]
    fn test_get_calibre_metadata_missing_db() {
        let dir = tempdir().unwrap();
        let result = get_calibre_metadata(dir.path().to_str().unwrap());
        match result {
            Err(AppError::LibraryNotFound(_)) => assert!(true),
            _ => assert!(false, "Expected LibraryNotFound error"),
        }
    }
}
