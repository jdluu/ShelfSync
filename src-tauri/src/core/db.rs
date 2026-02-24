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

    // Quick check for total book count
    let total: i64 = conn.query_row("SELECT count(*) FROM books", [], |r| r.get(0))?;
    eprintln!("[DB] Raw 'books' table count: {}", total);
    if total == 0 {
        return Ok(Vec::new());
    }

    let start = std::time::Instant::now();
    eprintln!("[DB] Executing metadata query (using subqueries for safety)...");
    
    // Using subqueries for authors, series, tags, and publisher to avoid row explosion from joins
    let mut stmt = conn.prepare(
        "SELECT 
            b.id, 
            b.title, 
            b.path, 
            (SELECT GROUP_CONCAT(a.name, ', ') FROM books_authors_link bal JOIN authors a ON bal.author = a.id WHERE bal.book = b.id) as authors,
            (SELECT GROUP_CONCAT(d.format, ',') FROM data d WHERE d.book = b.id) as formats,
            (SELECT s.name FROM series s WHERE s.id = b.series) as series,
            b.series_index,
            (SELECT GROUP_CONCAT(t.name, ',') FROM books_tags_link btl JOIN tags t ON btl.tag = t.id WHERE btl.book = b.id) as tags,
            (SELECT p.name FROM books_publishers_link bpl JOIN publishers p ON bpl.publisher = p.id WHERE bpl.book = b.id LIMIT 1) as publisher
         FROM books b"
    )?;

    let book_iter = stmt.query_map([], |row| {
        let formats_str: Option<String> = row.get(4)?;
        let formats = formats_str
            .map(|s| s.split(',').map(|f| f.to_string()).collect())
            .unwrap_or_default();

        let tags_str: Option<String> = row.get(7)?;
        let tags = tags_str
            .map(|s| s.split(',').map(|t| t.to_string()).collect())
            .unwrap_or_default();

        Ok(Book {
            id: row.get(0)?,
            title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Unknown Title".to_string()),
            path: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            authors: row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "Unknown Author".to_string()),
            cover_url: None,
            formats,
            series: row.get(5)?,
            series_index: row.get::<_, Option<f64>>(6)?.unwrap_or(1.0),
            tags,
            publisher: row.get(8)?,
        })
    })?;

    let mut books = Vec::new();
    let mut errors = 0;
    for (i, book_res) in book_iter.enumerate() {
        match book_res {
            Ok(book) => {
                let idx = i + 1;
                if idx % 100 == 0 || idx == (total as usize) {
                    eprintln!("[DB] Processed {}/{} books...", idx, total);
                }
                books.push(book);
            }
            Err(e) => {
                if errors < 10 {
                    eprintln!("[DB] ROW ERROR at index {}: {:?}", i, e);
                }
                errors += 1;
            }
        }
    }

    if errors > 0 {
        eprintln!("[DB] Finished with {} row errors.", errors);
    }
    eprintln!("[DB] SUCCESSFULLY loaded {} books in {:?}.", books.len(), start.elapsed());
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
