use crate::error::AppError;
use crate::models::Book;
use std::collections::HashMap;

/// Decodes HTML character entities in a string.
fn decode_html_entities(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '&' {
            let mut entity = String::new();
            let mut found_semi = false;
            for ec in chars.by_ref() {
                if ec == ';' {
                    found_semi = true;
                    break;
                }
                entity.push(ec);
                if entity.len() > 10 {
                    break;
                }
            }
            if !found_semi {
                result.push('&');
                result.push_str(&entity);
                continue;
            }
            if let Some(stripped) = entity.strip_prefix('#') {
                let code = if let Some(hex) = stripped
                    .strip_prefix('x')
                    .or_else(|| stripped.strip_prefix('X'))
                {
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

fn clean_html_description(text: &str) -> String {
    let clean = text
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("<p>", "\n")
        .replace("</p>", "\n")
        .replace("<div>", "\n")
        .replace("</div>", "\n")
        .replace("<li>", "\n- ")
        .replace("</li>", "");

    let mut result = String::new();
    let mut inside_tag = false;
    for ch in clean.chars() {
        if ch == '<' {
            inside_tag = true;
        } else if ch == '>' {
            inside_tag = false;
        } else if !inside_tag {
            result.push(ch);
        }
    }
    
    // Collapse multiple newlines and trim
    let decoded = decode_html_entities(&result);
    let mut final_res = String::new();
    let mut last_was_newline = false;
    for c in decoded.trim().chars() {
        if c == '\n' {
            if !last_was_newline {
                final_res.push(c);
                last_was_newline = true;
            }
        } else {
            final_res.push(c);
            last_was_newline = false;
        }
    }
    final_res
}

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

pub async fn get_calibre_metadata(pool: &deadpool_sqlite::Pool) -> Result<Vec<Book>, AppError> {
    let conn = pool.get().await.map_err(|e| AppError::Unknown(e.to_string()))?;

    conn.interact(move |conn| -> Result<Vec<Book>, AppError> {
        let _ = conn.execute("PRAGMA busy_timeout = 5000", []);

        let total: i64 = conn.query_row("SELECT count(*) FROM books", [], |r| r.get(0))?;
        if total == 0 {
            return Ok(Vec::new());
        }

        let start = std::time::Instant::now();

        let mut stmt = conn.prepare("SELECT id, title, path, series_index, pubdate FROM books")?;
        let book_iter = stmt.query_map([], |row| {
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
        })?;

        let mut books: Vec<Book> = book_iter.flatten().collect();

        let mut authors = fetch_authors(conn);
        let mut formats = fetch_formats(conn);
        let mut tags = fetch_tags(conn);
        let mut series = fetch_series(conn);
        let mut publishers = fetch_publishers(conn);
        let mut descriptions = fetch_descriptions(conn);
        let mut ratings = fetch_ratings(conn);
        let mut languages = fetch_languages(conn);

        for b in &mut books {
            if let Some(val) = authors.remove(&b.id) { b.authors = val; }
            if let Some(val) = formats.remove(&b.id) { b.formats = val; }
            if let Some(val) = tags.remove(&b.id) { b.tags = val; }
            if let Some(val) = series.remove(&b.id) { b.series = Some(val); }
            if let Some(val) = publishers.remove(&b.id) { b.publisher = Some(val); }
            if let Some(val) = descriptions.remove(&b.id) { b.description = Some(val); }
            if let Some(val) = ratings.remove(&b.id) { b.rating = Some(val); }
            if let Some(val) = languages.remove(&b.id) { b.language = Some(val); }
        }

        log::info!("Successfully loaded {} books in {:?}.", books.len(), start.elapsed());
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

        conn.execute("INSERT INTO books (id, title, path, series_index, pubdate) VALUES (1, 'Test Book 1', 'path1', 1.0, '2023-06-15T00:00:00+00:00')", []).unwrap();
        conn.execute("INSERT INTO authors (id, name) VALUES (1, 'Author 1')", []).unwrap();
        conn.execute("INSERT INTO books_authors_link (book, author) VALUES (1, 1)", []).unwrap();
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
