use crate::error::{lock_or_err, AppError};
use crate::models::Book;
use crate::AppState;
use rusqlite::{params, Connection};
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
            remote_id INTEGER,
            format TEXT,
            local_path TEXT,
            read_status TEXT DEFAULT 'unread'
        )",
        [],
    )?;

    // Migration
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

    Ok(())
}

/// Saves a book's metadata and its local filesystem path to the local database.
#[tauri::command]
pub fn save_local_book(
    book: Book,
    local_path: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let conn = open_client_db(&state)?;

    conn.execute(
        "INSERT INTO books (title, authors, remote_id, format, local_path, read_status) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            book.title,
            book.authors,
            book.id,
            "epub",
            local_path,
            "unread"
        ],
    )?;

    Ok(())
}

/// Updates the 'read_status' of a book in the local database.
#[tauri::command]
pub fn update_local_read_status(
    id: i64,
    status: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let conn = open_client_db(&state)?;

    conn.execute(
        "UPDATE books SET read_status = ?1 WHERE id = ?2",
        params![status, id],
    )?;

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
        "SELECT id, title, authors, local_path, remote_id, format, read_status FROM books",
    )?;

    let book_iter = stmt.query_map([], |row| {
        let _remote_id: Option<i64> = row.get(4)?;
        Ok(Book {
            id: row.get(0)?,
            title: row.get(1)?,
            authors: row.get(2)?,
            path: row.get(3)?,
            cover_url: None,
            formats: row
                .get::<_, Option<String>>(5)?
                .map(|s| vec![s])
                .unwrap_or_default(),
            series: None,
            series_index: 0.0,
            tags: Vec::new(),
            publisher: None,
            description: None,
            rating: None,
            language: None,
            published_date: None,
        })
    })?;

    let mut books = Vec::new();
    for book in book_iter {
        books.push(book?);
    }

    Ok(books)
}
