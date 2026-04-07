use crate::error::{lock_or_err, AppError};
use crate::models::Book;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

/// Opens the local client-side SQLite database.
///
/// Acquires the `app_data_dir` lock, constructs the DB path, and returns an open connection.
fn open_client_db(state: &AppState) -> Result<Connection, AppError> {
    let app_data_dir = {
        let guard = lock_or_err(&state.server.app_data_dir)?;
        guard
            .clone()
            .ok_or_else(|| AppError::Unknown("App data dir not set".to_string()))?
    };
    let db_path = app_data_dir.join("shelfsync_client.db");
    Ok(Connection::open(db_path)?)
}

/// Initializes the local client-side SQLite database.
/// Creates the 'books' table and handles migrations for the 'read_status' column.
#[tauri::command]
pub fn init_local_db(state: State<'_, AppState>) -> Result<(), AppError> {
    let conn = open_client_db(&state)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            authors TEXT NOT NULL,
            remote_id INTEGER UNIQUE,
            format TEXT,
            local_path TEXT,
            read_status TEXT DEFAULT 'unread',
            cover_local_path TEXT,
            series TEXT,
            series_index REAL,
            tags TEXT,
            publisher TEXT,
            description TEXT,
            rating REAL,
            language TEXT,
            published_date TEXT
        )",
        [],
    )?;

    let mut stmt = conn.prepare("PRAGMA table_info(books)")?;
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))?
        .collect::<Result<Vec<_>, _>>()?;

    if !columns.contains(&"read_status".to_string()) {
        conn.execute(
            "ALTER TABLE books ADD COLUMN read_status TEXT DEFAULT 'unread'",
            [],
        )?;
    }

    let new_columns = vec![
        ("cover_local_path", "TEXT"),
        ("series", "TEXT"),
        ("series_index", "REAL"),
        ("tags", "TEXT"),
        ("publisher", "TEXT"),
        ("description", "TEXT"),
        ("rating", "REAL"),
        ("language", "TEXT"),
        ("published_date", "TEXT"),
    ];

    for (col_name, col_type) in new_columns {
        if !columns.contains(&col_name.to_string()) {
            conn.execute(
                &format!("ALTER TABLE books ADD COLUMN {} {}", col_name, col_type),
                [],
            )?;
        }
    }

    let _ = conn.execute(
        "DELETE FROM books WHERE id NOT IN (SELECT MAX(id) FROM books GROUP BY remote_id) AND remote_id IS NOT NULL",
        [],
    );

    conn.execute("CREATE INDEX IF NOT EXISTS idx_books_title ON books(title)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_books_authors ON books(authors)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_books_series ON books(series)", [])?;

    Ok(())
}

/// Saves a book's metadata and its local filesystem path to the local database.
#[tauri::command]
pub fn save_local_book(
    book: Book,
    local_path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let mut conn = open_client_db(&state)?;

    let tx = conn.transaction()?;

    let exists: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM books WHERE remote_id = ?1",
            params![book.id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let tags_str = book.tags.join(",");
    
    let mut cover_path = book.cover_url.clone();
    let local_path_buf = std::path::Path::new(&local_path);
    if let Some(parent) = local_path_buf.parent() {
        let possible_cover = parent.join("cover.jpg");
        if possible_cover.exists() {
             let path_str = possible_cover.to_string_lossy().to_string();
             log::info!("[DB] Found local cover for {}: {}", book.title, path_str);
             cover_path = Some(path_str);
        } else {
             log::warn!("[DB] No local cover found at {:?} for {}", possible_cover, book.title);
        }
    }

    if exists > 0 {
        tx.execute(
            "UPDATE books SET title = ?1, authors = ?2, format = ?3, local_path = ?4, 
             cover_local_path = ?5, series = ?6, series_index = ?7, tags = ?8, 
             publisher = ?9, description = ?10, rating = ?11, language = ?12, 
             published_date = ?13 WHERE remote_id = ?14",
            params![
                book.title, book.authors, "epub", local_path,
                cover_path, book.series, book.series_index, tags_str,
                book.publisher, book.description, book.rating, book.language,
                book.published_date, book.id
            ],
        )?;
    } else {
        tx.execute(
            "INSERT INTO books (title, authors, remote_id, format, local_path, read_status, 
                cover_local_path, series, series_index, tags, publisher, description, rating, language, published_date) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                book.title, book.authors, book.id, "epub", local_path, "unread",
                cover_path, book.series, book.series_index, tags_str,
                book.publisher, book.description, book.rating, book.language, book.published_date
            ],
        )?;
    }

    tx.commit()?;

    // Sync to Calibre metadata.db in the library root
    let local_path_buf = std::path::Path::new(&local_path);
    if let Some(root) = local_path_buf.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
        if let Err(e) = crate::core::calibre::sync_book_to_calibre_db(root, &book) {
            log::error!("Failed to sync to Calibre metadata.db: {}", e);
        }
    }

    let book_id_str = book.id.to_string();
    let title_str = book.title.clone();
    let path_clone = local_path.clone();
    
    if let Ok(lock) = state.search_engine.lock() {
        if let Some(engine) = lock.as_ref() {
            let search_engine = engine.clone();
            std::thread::spawn(move || {
                if let Err(e) = search_engine.index_epub_content(&book_id_str, &title_str, std::path::Path::new(&path_clone)) {
                    log::error!("Failed to index epub for search: {}", e);
                }
            });
        }
    }

    Ok(())
}

/// Updates the 'read_status' of a book in the local database.
#[tauri::command]
pub fn update_local_read_status(
    id: i64,
    status: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let mut conn = open_client_db(&state)?;
    let tx = conn.transaction()?;

    tx.execute(
        "UPDATE books SET read_status = ?1 WHERE id = ?2",
        params![status, id],
    )?;

    tx.commit()?;
    Ok(())
}

/// Retrieves all books from the local client-side database.
#[tauri::command]
pub fn get_local_books(state: State<'_, AppState>) -> Result<Vec<Book>, AppError> {
    let app_data_dir = {
        let guard = lock_or_err(&state.server.app_data_dir)?;
        guard
            .clone()
            .ok_or_else(|| AppError::Unknown("App data dir not set".to_string()))?
    };

    let db_path = app_data_dir.join("shelfsync_client.db");
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let conn = Connection::open(db_path)?;
    let mut stmt = conn.prepare(
        "SELECT id, title, authors, local_path, remote_id, format, read_status,
                cover_local_path, series, series_index, tags, publisher, description, rating, language, published_date
         FROM books",
    )?;

    let book_iter = stmt.query_map([], |row| {
        let remote_id: Option<i64> = row.get(4)?;
        let tags_str: Option<String> = row.get(10)?;
        let tags = tags_str
            .map(|s| s.split(',').filter(|t| !t.is_empty()).map(String::from).collect())
            .unwrap_or_default();

        Ok(Book {
            id: row.get(0)?,
            title: row.get(1)?,
            authors: row.get(2)?,
            path: row.get(3)?,
            remote_id,
            formats: row
                .get::<_, Option<String>>(5)?
                .map(|s| vec![s])
                .unwrap_or_default(),
            cover_url: row.get(7)?,
            series: row.get(8)?,
            series_index: row.get::<_, Option<f64>>(9)?.unwrap_or(0.0),
            tags,
            publisher: row.get(11)?,
            description: row.get(12)?,
            rating: row.get(13)?,
            language: row.get(14)?,
            published_date: row.get(15)?,
        })
    })?;

    let mut books = Vec::new();
    for book_res in book_iter {
        let book = book_res?;
        if let Some(cover_url) = &book.cover_url {
             log::info!("[RETRIEVE] Book: {}, Cover: {}", book.title, cover_url);
        } else {
             log::warn!("[RETRIEVE] Book: {} has NO cover path", book.title);
        }
        books.push(book);
    }

    Ok(books)
}

/// Deletes a book from the local database and removes its associated file from disk.
#[tauri::command]
pub fn delete_local_book(id: i64, state: State<'_, AppState>) -> Result<(), AppError> {
    let conn = open_client_db(&state)?;

    let local_path: Option<String> = conn
        .query_row(
            "SELECT local_path FROM books WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(path_str) = local_path {
        let path = std::path::Path::new(&path_str);
        if path.exists() {
            if let Err(e) = std::fs::remove_file(path) {
                log::error!("Failed to delete file at {:?}: {}", path, e);
            } else {
                log::info!("Deleted local file at {:?}", path);
            }
        }
        
        if let Some(parent) = path.parent() {
            let _ = std::fs::remove_file(parent.join("cover.jpg"));
            let _ = std::fs::remove_file(parent.join("metadata.opf"));
            if let Err(e) = std::fs::remove_dir(parent) {
                log::debug!("Could not remove parent directory {:?} (might not be empty): {}", parent, e);
            } else {
                log::info!("Deleted parent directory {:?}", parent);
            }
        }
    }

    conn.execute("DELETE FROM books WHERE id = ?1", params![id])?;

    Ok(())
}
