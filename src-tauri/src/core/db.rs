use crate::error::AppError;
use crate::models::Book;
use std::collections::HashMap;

use super::html_clean::clean_html_description;

fn fetch_authors(conn: &rusqlite::Connection) -> HashMap<i64, String> {
    let mut map = HashMap::new();
    let query = "SELECT bal.book, GROUP_CONCAT(a.name, ', ')
                 FROM authors a
                 JOIN books_authors_link bal ON a.id = bal.author
                 GROUP BY bal.book";
    if let Ok(mut stmt) = conn.prepare(query) {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(id), Ok(names)) = (row.get(0), row.get(1)) {
                    map.insert(id, names);
                }
            }
        }
    }
    map
}

fn fetch_formats(conn: &rusqlite::Connection) -> HashMap<i64, Vec<String>> {
    let mut map = HashMap::new();
    let query = "SELECT book, GROUP_CONCAT(format, ',') FROM data GROUP BY book";
    if let Ok(mut stmt) = conn.prepare(query) {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(id), Ok(fmts)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                    map.insert(id, fmts.split(',').map(String::from).collect());
                }
            }
        }
    }
    map
}

fn fetch_tags(conn: &rusqlite::Connection) -> HashMap<i64, Vec<String>> {
    let mut map = HashMap::new();
    let query = "SELECT btl.book, GROUP_CONCAT(t.name, ',')
                 FROM tags t
                 JOIN books_tags_link btl ON t.id = btl.tag
                 GROUP BY btl.book";
    if let Ok(mut stmt) = conn.prepare(query) {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(id), Ok(tags)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                    map.insert(id, tags.split(',').map(|s| s.trim().to_string()).collect());
                }
            }
        }
    }
    map
}

fn fetch_series(conn: &rusqlite::Connection) -> HashMap<i64, String> {
    let mut map = HashMap::new();
    let query = "SELECT bsl.book, s.name
                 FROM series s
                 JOIN books_series_link bsl ON s.id = bsl.series";
    if let Ok(mut stmt) = conn.prepare(query) {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(id), Ok(name)) = (row.get(0), row.get(1)) {
                    map.insert(id, name);
                }
            }
        }
    }
    map
}

fn fetch_publishers(conn: &rusqlite::Connection) -> HashMap<i64, String> {
    let mut map = HashMap::new();
    let query = "SELECT bpl.book, p.name
                 FROM publishers p
                 JOIN books_publishers_link bpl ON p.id = bpl.publisher";
    if let Ok(mut stmt) = conn.prepare(query) {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(id), Ok(name)) = (row.get(0), row.get(1)) {
                    map.insert(id, name);
                }
            }
        }
    }
    map
}

fn fetch_descriptions(conn: &rusqlite::Connection) -> HashMap<i64, String> {
    let mut map = HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT book, text FROM comments") {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(id), Ok(text)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                    let cleaned = clean_html_description(&text);
                    if !cleaned.is_empty() {
                        map.insert(id, cleaned);
                    }
                }
            }
        }
    }
    map
}

fn fetch_ratings(conn: &rusqlite::Connection) -> HashMap<i64, f64> {
    let mut map = HashMap::new();
    let query = "SELECT brl.book, r.rating
                 FROM ratings r
                 JOIN books_ratings_link brl ON r.id = brl.rating";
    if let Ok(mut stmt) = conn.prepare(query) {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(id), Ok(rating)) = (row.get(0), row.get(1)) {
                    map.insert(id, rating);
                }
            }
        }
    }
    map
}

fn fetch_languages(conn: &rusqlite::Connection) -> HashMap<i64, String> {
    let mut map = HashMap::new();
    let query = "SELECT bll.book, l.lang_code
                 FROM languages l
                 JOIN books_languages_link bll ON l.id = bll.lang_code";
    if let Ok(mut stmt) = conn.prepare(query) {
        if let Ok(mut rows) = stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(id), Ok(lang)) = (row.get(0), row.get(1)) {
                    map.insert(id, lang);
                }
            }
        }
    }
    map
}

struct RelatedMaps {
    authors: HashMap<i64, String>,
    formats: HashMap<i64, Vec<String>>,
    tags: HashMap<i64, Vec<String>>,
    series: HashMap<i64, String>,
    publishers: HashMap<i64, String>,
    descriptions: HashMap<i64, String>,
    ratings: HashMap<i64, f64>,
    languages: HashMap<i64, String>,
}

fn apply_related_data(book: &mut Book, maps: &mut RelatedMaps) {
    if let Some(val) = maps.authors.remove(&book.id) { book.authors = val; }
    if let Some(val) = maps.formats.remove(&book.id) { book.formats = val; }
    if let Some(val) = maps.tags.remove(&book.id) { book.tags = val; }
    if let Some(val) = maps.series.remove(&book.id) { book.series = Some(val); }
    if let Some(val) = maps.publishers.remove(&book.id) { book.publisher = Some(val); }
    if let Some(val) = maps.descriptions.remove(&book.id) { book.description = Some(val); }
    if let Some(val) = maps.ratings.remove(&book.id) { book.rating = Some(val); }
    if let Some(val) = maps.languages.remove(&book.id) { book.language = Some(val); }
}

fn map_book_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Book> {
    Ok(Book {
        id: row.get(0)?,
        title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Unknown Title".to_string()),
        path: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
        remote_id: None,
        authors: String::new(),
        cover_url: None,
        formats: Vec::new(),
        series: None,
        series_index: row.get::<_, Option<f64>>(3)?.unwrap_or(1.0),
        tags: Vec::new(),
        publisher: None,
        description: None,
        rating: None,
        language: None,
        published_date: row.get::<_, Option<String>>(4)?.and_then(|d| {
            if d.starts_with("0101-01-01") { None } else { Some(d.split('T').next().unwrap_or(&d).to_string()) }
        }),
    })
}

/// Loads book rows (optionally a single `limit`/`offset` page, ordered by id)
/// and enriches them with related data.
///
/// A `None` limit means "load everything"; SQLite also treats a negative
/// LIMIT as unbounded.
fn load_books(
    conn: &rusqlite::Connection,
    limit: Option<i64>,
    offset: i64,
) -> Result<Vec<Book>, AppError> {
    let _ = conn.execute("PRAGMA busy_timeout = 5000", []);

    let total: i64 = conn.query_row("SELECT count(*) FROM books", [], |r| r.get(0))?;
    if total == 0 {
        return Ok(Vec::new());
    }

    let start = std::time::Instant::now();

    let mut stmt = conn.prepare(
        "SELECT id, title, path, series_index, pubdate FROM books ORDER BY id LIMIT ?1 OFFSET ?2",
    )?;
    let book_iter = stmt.query_map(
        rusqlite::params![limit.unwrap_or(-1), offset.max(0)],
        map_book_row,
    )?;

    let mut books: Vec<Book> = book_iter.flatten().collect();

    let mut related = RelatedMaps {
        authors: fetch_authors(conn),
        formats: fetch_formats(conn),
        tags: fetch_tags(conn),
        series: fetch_series(conn),
        publishers: fetch_publishers(conn),
        descriptions: fetch_descriptions(conn),
        ratings: fetch_ratings(conn),
        languages: fetch_languages(conn),
    };

    for b in &mut books {
        apply_related_data(b, &mut related);
    }

    log::info!("Successfully loaded {} books in {:?}.", books.len(), start.elapsed());
    Ok(books)
}

pub async fn get_calibre_metadata(pool: &deadpool_sqlite::Pool) -> Result<Vec<Book>, AppError> {
    let conn = pool.get().await.map_err(|e| AppError::Unknown(e.to_string()))?;

    conn.interact(move |conn| load_books(conn, None, 0))
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))?
}

/// Paginated variant of [`get_calibre_metadata`] for large libraries.
///
/// Returns at most `limit` books starting at `offset` (ordered by id), or all
/// books when `limit` is `None`. Related data (authors, formats, ...) is
/// fetched for the whole library as usual but only attached to the returned
/// page, keeping per-request allocations bounded.
pub async fn get_calibre_metadata_page(
    pool: &deadpool_sqlite::Pool,
    limit: Option<i64>,
    offset: i64,
) -> Result<Vec<Book>, AppError> {
    let conn = pool.get().await.map_err(|e| AppError::Unknown(e.to_string()))?;

    conn.interact(move |conn| load_books(conn, limit, offset))
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
        create_mock_calibre_db_with_count(path, 1);
    }

    fn create_mock_calibre_db_with_count(path: &Path, count: i64) {
        let conn = Connection::open(path.join("metadata.db")).unwrap();
        conn.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, series_index REAL, pubdate TEXT)", []).unwrap();
        conn.execute("CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE TABLE books_authors_link (id INTEGER PRIMARY KEY, book INTEGER, author INTEGER)", []).unwrap();
        conn.execute("CREATE TABLE data (id INTEGER PRIMARY KEY, book INTEGER, format TEXT)", []).unwrap();
        conn.execute("CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE TABLE books_tags_link (id INTEGER PRIMARY KEY, book INTEGER, tag INTEGER)", []).unwrap();
        conn.execute("CREATE TABLE series (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE TABLE books_series_link (id INTEGER PRIMARY KEY, book INTEGER, series INTEGER)", []).unwrap();
        conn.execute("CREATE TABLE publishers (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE TABLE books_publishers_link (id INTEGER PRIMARY KEY, book INTEGER, publisher INTEGER)", []).unwrap();
        conn.execute("CREATE TABLE comments (id INTEGER PRIMARY KEY, book INTEGER, text TEXT)", []).unwrap();
        conn.execute("CREATE TABLE ratings (id INTEGER PRIMARY KEY, rating REAL)", []).unwrap();
        conn.execute("CREATE TABLE books_ratings_link (id INTEGER PRIMARY KEY, book INTEGER, rating INTEGER)", []).unwrap();
        conn.execute("CREATE TABLE languages (id INTEGER PRIMARY KEY, lang_code TEXT)", []).unwrap();
        conn.execute("CREATE TABLE books_languages_link (id INTEGER PRIMARY KEY, book INTEGER, lang_code INTEGER)", []).unwrap();

        for id in 1..=count {
            conn.execute(
                "INSERT INTO books (id, title, path, series_index, pubdate) VALUES (?1, ?2, ?3, 1.0, '2023-06-15T00:00:00+00:00')",
                rusqlite::params![id, format!("Test Book {id}"), format!("path{id}")],
            ).unwrap();
            conn.execute("INSERT INTO authors (id, name) VALUES (?1, ?2)", rusqlite::params![id, format!("Author {id}")]).unwrap();
            conn.execute("INSERT INTO books_authors_link (book, author) VALUES (?1, ?1)", [id]).unwrap();
            conn.execute("INSERT INTO data (book, format) VALUES (?1, 'EPUB')", [id]).unwrap();
            conn.execute("INSERT INTO tags (id, name) VALUES (?1, 'Fantasy')", [id]).unwrap();
            conn.execute("INSERT INTO books_tags_link (book, tag) VALUES (?1, ?1)", [id]).unwrap();
            conn.execute("INSERT INTO publishers (id, name) VALUES (?1, 'Test Publisher')", [id]).unwrap();
            conn.execute("INSERT INTO books_publishers_link (book, publisher) VALUES (?1, ?1)", [id]).unwrap();
            conn.execute("INSERT INTO languages (id, lang_code) VALUES (?1, 'eng')", [id]).unwrap();
            conn.execute("INSERT INTO books_languages_link (book, lang_code) VALUES (?1, ?1)", [id]).unwrap();
        }

        if count >= 1 {
            conn.execute("INSERT INTO comments (book, text) VALUES (1, '<p>A great book.</p>')", []).unwrap();
        }
    }

    fn open_pool(path: &Path) -> deadpool_sqlite::Pool {
        let cfg = deadpool_sqlite::Config::new(path.join("metadata.db"));
        cfg.builder(deadpool_sqlite::Runtime::Tokio1).unwrap().build().unwrap()
    }

    #[tokio::test]
    async fn test_get_calibre_metadata() {
        let dir = tempdir().unwrap();
        create_mock_calibre_db(dir.path());
        let pool = open_pool(dir.path());
        let books = get_calibre_metadata(&pool).await.unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].title, "Test Book 1");
        assert_eq!(books[0].authors, "Author 1");
        assert_eq!(books[0].formats, vec!["EPUB"]);
    }

    fn mock_pool(count: i64) -> (tempfile::TempDir, deadpool_sqlite::Pool) {
        let dir = tempdir().unwrap();
        create_mock_calibre_db_with_count(dir.path(), count);
        let pool = open_pool(dir.path());
        (dir, pool)
    }

    #[tokio::test]
    async fn test_get_calibre_metadata_page_slices_by_limit_and_offset() {
        let (_dir, pool) = mock_pool(5);

        let first = get_calibre_metadata_page(&pool, Some(2), 0).await.unwrap();
        assert_eq!(first.len(), 2);
        assert_eq!(first[0].id, 1);
        assert_eq!(first[0].title, "Test Book 1");
        assert_eq!(first[1].id, 2);

        let middle = get_calibre_metadata_page(&pool, Some(2), 2).await.unwrap();
        assert_eq!(middle.len(), 2);
        assert_eq!(middle[0].id, 3);
        assert_eq!(middle[1].id, 4);

        let last = get_calibre_metadata_page(&pool, Some(2), 4).await.unwrap();
        assert_eq!(last.len(), 1);
        assert_eq!(last[0].id, 5);

        let past_end = get_calibre_metadata_page(&pool, Some(2), 10).await.unwrap();
        assert!(past_end.is_empty());
    }

    #[tokio::test]
    async fn test_get_calibre_metadata_page_without_limit_returns_all() {
        let (_dir, pool) = mock_pool(7);

        let all = get_calibre_metadata_page(&pool, None, 0).await.unwrap();
        assert_eq!(all.len(), 7);
        let ids: Vec<i64> = all.iter().map(|b| b.id).collect();
        assert_eq!(ids, vec![1, 2, 3, 4, 5, 6, 7]);
    }

    #[tokio::test]
    async fn test_get_calibre_metadata_page_attaches_related_data() {
        let (_dir, pool) = mock_pool(3);

        let page = get_calibre_metadata_page(&pool, Some(1), 2).await.unwrap();
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].authors, "Author 3");
        assert_eq!(page[0].formats, vec!["EPUB"]);
        assert_eq!(page[0].tags, vec!["Fantasy"]);
        assert_eq!(page[0].publisher.as_deref(), Some("Test Publisher"));
    }
}
