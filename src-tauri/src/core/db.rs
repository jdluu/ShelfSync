use crate::error::AppError;
use crate::models::Book;

/// Decodes HTML character entities in a string.
///
/// Handles numeric entities (`&#8217;`, `&#x2019;`) and common named entities
/// (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&nbsp;`, `&mdash;`, `&ndash;`, `&hellip;`, etc.).
fn decode_html_entities(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '&' {
            let mut entity = String::new();
            for ec in chars.by_ref() {
                if ec == ';' {
                    break;
                }
                entity.push(ec);
                if entity.len() > 10 {
                    // Not a valid entity, push what we have and move on
                    result.push('&');
                    result.push_str(&entity);
                    entity.clear();
                    break;
                }
            }
            if entity.is_empty() {
                continue;
            }
            // Try numeric entity
            if let Some(stripped) = entity.strip_prefix('#') {
                let code = if let Some(hex) = stripped.strip_prefix('x').or_else(|| stripped.strip_prefix('X')) {
                    u32::from_str_radix(hex, 16).ok()
                } else {
                    stripped.parse::<u32>().ok()
                };
                if let Some(c) = code.and_then(char::from_u32) {
                    result.push(c);
                } else {
                    result.push('&');
                    result.push_str(&entity);
                    result.push(';');
                }
            } else {
                // Named entities
                match entity.as_str() {
                    "amp" => result.push('&'),
                    "lt" => result.push('<'),
                    "gt" => result.push('>'),
                    "quot" => result.push('"'),
                    "apos" => result.push('\''),
                    "nbsp" => result.push('\u{00A0}'),
                    "mdash" => result.push('\u{2014}'),
                    "ndash" => result.push('\u{2013}'),
                    "hellip" => result.push('\u{2026}'),
                    "lsquo" => result.push('\u{2018}'),
                    "rsquo" => result.push('\u{2019}'),
                    "ldquo" => result.push('\u{201C}'),
                    "rdquo" => result.push('\u{201D}'),
                    "trade" => result.push('\u{2122}'),
                    "copy" => result.push('\u{00A9}'),
                    "reg" => result.push('\u{00AE}'),
                    _ => {
                        result.push('&');
                        result.push_str(&entity);
                        result.push(';');
                    }
                }
            }
        } else {
            result.push(ch);
        }
    }
    result
}

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
    let mut stmt = conn.prepare("SELECT id, title, path, series_index, pubdate FROM books")?;

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
            description: None,
            rating: None,
            language: None,
            published_date: row.get::<_, Option<String>>(4)?.and_then(|d| {
                // Calibre stores dates as ISO strings; strip time portion
                if d.starts_with("0101-01-01") { None } else { Some(d.split('T').next().unwrap_or(&d).to_string()) }
            }),
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

    // 5. Batch-fetch tags
    let mut tags_map: std::collections::HashMap<i64, Vec<String>> =
        std::collections::HashMap::new();
    if let Ok(mut tag_stmt) = conn.prepare(
        "SELECT btl.book, GROUP_CONCAT(t.name, ',')
         FROM tags t
         JOIN books_tags_link btl ON t.id = btl.tag
         GROUP BY btl.book",
    ) {
        if let Ok(mut rows) = tag_stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(book_id), Ok(tags)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                    tags_map.insert(book_id, tags.split(',').map(|s| s.trim().to_string()).collect());
                }
            }
        }
    }

    // 6. Batch-fetch series
    let mut series_map: std::collections::HashMap<i64, String> =
        std::collections::HashMap::new();
    if let Ok(mut series_stmt) = conn.prepare(
        "SELECT bsl.book, s.name
         FROM series s
         JOIN books_series_link bsl ON s.id = bsl.series",
    ) {
        if let Ok(mut rows) = series_stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(book_id), Ok(name)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                    series_map.insert(book_id, name);
                }
            }
        }
    }

    // 7. Batch-fetch publishers
    let mut publisher_map: std::collections::HashMap<i64, String> =
        std::collections::HashMap::new();
    if let Ok(mut pub_stmt) = conn.prepare(
        "SELECT bpl.book, p.name
         FROM publishers p
         JOIN books_publishers_link bpl ON p.id = bpl.publisher",
    ) {
        if let Ok(mut rows) = pub_stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(book_id), Ok(name)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                    publisher_map.insert(book_id, name);
                }
            }
        }
    }

    // 8. Batch-fetch descriptions (comments)
    let mut desc_map: std::collections::HashMap<i64, String> =
        std::collections::HashMap::new();
    if let Ok(mut desc_stmt) = conn.prepare(
        "SELECT book, text FROM comments",
    ) {
        if let Ok(mut rows) = desc_stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(book_id), Ok(text)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                    // Strip HTML tags from Calibre's HTML descriptions
                    let clean = text
                        .replace("<br>", "\n")
                        .replace("<br/>", "\n")
                        .replace("<br />", "\n")
                        .replace("<p>", "")
                        .replace("</p>", "\n");
                    // Remove remaining HTML tags
                    let mut result = String::new();
                    let mut inside_tag = false;
                    for ch in clean.chars() {
                        if ch == '<' { inside_tag = true; }
                        else if ch == '>' { inside_tag = false; }
                        else if !inside_tag { result.push(ch); }
                    }
                    let trimmed = result.trim().to_string();
                    // Decode HTML character entities (&#NNN; and common named entities)
                    let decoded = decode_html_entities(&trimmed);
                    if !decoded.is_empty() {
                        desc_map.insert(book_id, decoded);
                    }
                }
            }
        }
    }

    // 9. Batch-fetch ratings
    let mut rating_map: std::collections::HashMap<i64, f64> =
        std::collections::HashMap::new();
    if let Ok(mut rat_stmt) = conn.prepare(
        "SELECT brl.book, r.rating
         FROM ratings r
         JOIN books_ratings_link brl ON r.id = brl.rating",
    ) {
        if let Ok(mut rows) = rat_stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(book_id), Ok(rating)) = (row.get::<_, i64>(0), row.get::<_, f64>(1)) {
                    rating_map.insert(book_id, rating);
                }
            }
        }
    }

    // 10. Batch-fetch languages
    let mut lang_map: std::collections::HashMap<i64, String> =
        std::collections::HashMap::new();
    if let Ok(mut lang_stmt) = conn.prepare(
        "SELECT bll.book, l.lang_code
         FROM languages l
         JOIN books_languages_link bll ON l.id = bll.lang_code",
    ) {
        if let Ok(mut rows) = lang_stmt.query([]) {
            while let Ok(Some(row)) = rows.next() {
                if let (Ok(book_id), Ok(lang)) = (row.get::<_, i64>(0), row.get::<_, String>(1)) {
                    lang_map.insert(book_id, lang);
                }
            }
        }
    }

    // 11. Join in-memory
    for b in &mut books {
        if let Some(authors) = authors_map.remove(&b.id) {
            b.authors = authors;
        }
        if let Some(formats) = formats_map.remove(&b.id) {
            b.formats = formats;
        }
        if let Some(tags) = tags_map.remove(&b.id) {
            b.tags = tags;
        }
        if let Some(series) = series_map.remove(&b.id) {
            b.series = Some(series);
        }
        if let Some(publisher) = publisher_map.remove(&b.id) {
            b.publisher = Some(publisher);
        }
        if let Some(desc) = desc_map.remove(&b.id) {
            b.description = Some(desc);
        }
        if let Some(rating) = rating_map.remove(&b.id) {
            b.rating = Some(rating);
        }
        if let Some(lang) = lang_map.remove(&b.id) {
            b.language = Some(lang);
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
            "CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, series_index REAL, pubdate TEXT)",
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

        conn.execute("INSERT INTO books (id, title, path, series_index, pubdate) VALUES (1, 'Test Book 1', 'path1', 1.0, '2023-06-15T00:00:00+00:00')", []).unwrap();
        conn.execute("INSERT INTO authors (id, name) VALUES (1, 'Author 1')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO books_authors_link (book, author) VALUES (1, 1)",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO data (book, format) VALUES (1, 'EPUB')", []).unwrap();
        conn.execute("INSERT INTO tags (id, name) VALUES (1, 'Fantasy')", []).unwrap();
        conn.execute("INSERT INTO books_tags_link (book, tag) VALUES (1, 1)", []).unwrap();
        conn.execute("INSERT INTO publishers (id, name) VALUES (1, 'Test Publisher')", []).unwrap();
        conn.execute("INSERT INTO books_publishers_link (book, publisher) VALUES (1, 1)", []).unwrap();
        conn.execute("INSERT INTO comments (book, text) VALUES (1, '<p>A great book.</p>')", []).unwrap();
        conn.execute("INSERT INTO languages (id, lang_code) VALUES (1, 'eng')", []).unwrap();
        conn.execute("INSERT INTO books_languages_link (book, lang_code) VALUES (1, 1)", []).unwrap();
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
