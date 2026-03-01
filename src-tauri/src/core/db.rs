use crate::error::AppError;
use crate::models::Book;

/**
 * Fetches book metadata from a Calibre library database using an async connection pool.
 *
 * @summary Queries the Calibre `metadata.db` for book details, authors, and formats via `deadpool-sqlite`.
 * @param pool - The async connection pool to the Calibre library.
 * @returns {Result<Vec<Book>, AppError>} A list of Book structures or an error if the DB is inaccessible.
 */
pub async fn get_calibre_metadata(pool: &deadpool_sqlite::Pool) -> Result<Vec<Book>, AppError> {
    let conn = pool.get().await.map_err(|e| AppError::Unknown(e.to_string()))?;
    
    conn.interact(move |conn| -> Result<Vec<Book>, AppError> {
        let _ = conn.execute("PRAGMA busy_timeout = 5000", []);

        // 1. Get total book count
    let total: i64 = conn.query_row("SELECT count(*) FROM books", [], |r| r.get(0))?;
    if total == 0 {
        return Ok(Vec::new());
    }

    let start = std::time::Instant::now();

    // 2. Fetch basic metadata
    let mut stmt = conn.prepare("SELECT id, title, path, series_index FROM books")?;

    let book_iter = stmt.query_map([], |row| {
        Ok(Book {
            id: row.get(0)?,
            title: row
                .get::<_, Option<String>>(1)?
                .unwrap_or_else(|| "Unknown Title".to_string()),
            path: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            authors: String::new(),
            cover_url: None,
            formats: Vec::new(),
            series: None,
            series_index: row.get::<_, Option<f64>>(3)?.unwrap_or(1.0),
            tags: Vec::new(),
            publisher: None,
        })
    })?;

    let mut books = Vec::new();
    for book in book_iter.flatten() {
        books.push(book);
    }

    // 3. Batch-fetch authors via GROUP_CONCAT (eliminates N+1 queries)
    let mut authors_map = std::collections::HashMap::new();
    if let Ok(mut auth_stmt) = conn.prepare(
        "SELECT bal.book, GROUP_CONCAT(a.name, ', ')
         FROM authors a
         JOIN books_authors_link bal ON a.id = bal.author
         GROUP BY bal.book",
    ) {
        if let Ok(mut rows) = auth_stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(book_id), Ok(names)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                    authors_map.insert(book_id, names);
                }
            }
        }
    }

    // 4. Batch-fetch formats via GROUP_CONCAT
    let mut formats_map: std::collections::HashMap<i64, Vec<String>> =
        std::collections::HashMap::new();
    if let Ok(mut fmt_stmt) =
        conn.prepare("SELECT book, GROUP_CONCAT(format, ',') FROM data GROUP BY book")
    {
        if let Ok(mut rows) = fmt_stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(book_id), Ok(fmts)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                    formats_map.insert(book_id, fmts.split(',').map(|s| s.to_string()).collect());
                }
            }
        }
    }

    // 5. Join in-memory
    for b in &mut books {
        if let Some(authors) = authors_map.remove(&b.id) {
            b.authors = authors;
        }
        if let Some(formats) = formats_map.remove(&b.id) {
            b.formats = formats;
        }
    }

        log::info!(
            "Successfully loaded {} books in {:?}.",
            books.len(),
            start.elapsed()
        );
        Ok(books)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::path::Path;
    use tempfile::tempdir;

    fn create_mock_calibre_db(path: &Path) {
        let conn = Connection::open(path.join("metadata.db")).unwrap();
        conn.execute(
            "CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, series_index REAL)",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)",
            [],
        )
        .unwrap();
        conn.execute("CREATE TABLE books_authors_link (id INTEGER PRIMARY KEY, book INTEGER, author INTEGER)", []).unwrap();
        conn.execute(
            "CREATE TABLE data (id INTEGER PRIMARY KEY, book INTEGER, format TEXT)",
            [],
        )
        .unwrap();

        conn.execute("INSERT INTO books (id, title, path, series_index) VALUES (1, 'Test Book 1', 'path1', 1.0)", []).unwrap();
        conn.execute("INSERT INTO authors (id, name) VALUES (1, 'Author 1')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO books_authors_link (book, author) VALUES (1, 1)",
            [],
        )
        .unwrap();
    }

    #[tokio::test]
    async fn test_get_calibre_metadata() {
        let dir = tempdir().unwrap();
        create_mock_calibre_db(dir.path());
        
        let cfg = deadpool_sqlite::Config::new(dir.path().join("metadata.db"));
        let pool = cfg.builder(deadpool_sqlite::Runtime::Tokio1).unwrap().build().unwrap();

        let books = get_calibre_metadata(&pool).await.unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].title, "Test Book 1");
        assert_eq!(books[0].authors, "Author 1");
    }
}
