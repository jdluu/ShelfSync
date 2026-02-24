use crate::error::AppError;
use crate::models::Book;
use rusqlite::{Connection, OpenFlags};
use std::path::Path;

pub fn get_calibre_metadata(library_path: &str) -> Result<Vec<Book>, AppError> {
    let lib_path = Path::new(library_path);
    let db_path = lib_path.join("metadata.db");

    log::info!("Checking Calibre library at: {:?}", lib_path);
    log::info!("Metadata DB path: {:?}", db_path);
    log::info!("DB path exists: {}", db_path.exists());

    if !db_path.exists() {
        return Err(AppError::LibraryNotFound(library_path.to_string()));
    }

    // Open the DB in Read-Only mode directly
    let conn = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;

    // Query: Books joined with Authors
    // Calibre schema:
    // books (id, title, path, ...)
    // authors (id, name, ...)
    // books_authors_link (id, book, author, ...)

    let start = std::time::Instant::now();
    eprintln!("[DB] Starting metadata fetch at {:?}", db_path);
    
    // Check tables existence
    let tables: Vec<String> = {
        let mut t_stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'")?;
        let rows = t_stmt.query_map([], |r| r.get(0))?;
        rows.map(|r| r.unwrap_or_else(|_| "err".to_string())).collect()
    };
    eprintln!("[DB] Found tables: {:?}", tables);

    // Progressive query
    let mut stmt = conn.prepare("SELECT id, title, path FROM books")?;
    
    let book_iter = stmt.query_map([], |row| {
        Ok(Book {
            id: row.get(0)?,
            title: row.get(1)?,
            path: row.get(2)?,
            authors: "".to_string(), // Step 1: Blank
            cover_url: None,
            formats: vec![],
            series: None,
            series_index: 1.0,
            tags: vec![],
            publisher: None,
        })
    })?;

    let mut books = Vec::new();
    for (i, book) in book_iter.enumerate() {
        if i % 100 == 0 {
            eprintln!("[DB] Row {}...", i);
        }
        books.push(book?);
    }

    eprintln!("[DB] Base query done: {} books in {:?}.", books.len(), start.elapsed());

    // Step 2: Try to enrich with authors if table exists
    if tables.contains(&"authors".to_string()) && tables.contains(&"books_authors_link".to_string()) {
        eprintln!("[DB] Enriching with authors...");
        for book in &mut books {
            let authors: Option<String> = conn.query_row(
                "SELECT GROUP_CONCAT(name, ', ') FROM authors WHERE id IN (SELECT author FROM books_authors_link WHERE book = ?)",
                [book.id],
                |r| r.get(0)
            ).ok().flatten();
            book.authors = authors.unwrap_or_default();
        }
        eprintln!("[DB] Authors enrichment done.");
    }

    // Step 3: Formats
    if tables.contains(&"data".to_string()) {
        eprintln!("[DB] Enriching with formats...");
        for book in &mut books {
            let formats: String = conn.query_row(
                "SELECT GROUP_CONCAT(format, ',') FROM data WHERE book = ?",
                [book.id],
                |r| r.get(0)
            ).unwrap_or_else(|_| "".to_string());
            if !formats.is_empty() {
                book.formats = formats.split(',').map(|s| s.to_string()).collect();
            }
        }
        eprintln!("[DB] Formats enrichment done.");
    }

    eprintln!("[DB] Full retrieval complete: {} books in {:?}.", books.len(), start.elapsed());
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
