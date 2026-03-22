use crate::error::AppError;
use rusqlite::Connection;
use std::path::Path;

#[derive(serde::Serialize)]
pub struct ProgressRecord {
    pub book_id: i64,
    /// Status of the book: 'unread', 'reading', or 'finished'
    pub status: String,
    /// Unix timestamp of the last progress update
    pub last_updated: i64,
}

pub fn init_progress_db(app_data_dir: &Path) -> Result<Connection, AppError> {
    let db_path = app_data_dir.join("progress.db");
    let conn = Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS progress (
            book_id INTEGER PRIMARY KEY,
            status TEXT NOT NULL,
            last_updated INTEGER NOT NULL
        )",
        [],
    )?;

    Ok(conn)
}

pub fn update_progress(conn: &Connection, book_id: i64, status: &str) -> Result<(), AppError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    conn.execute(
        "INSERT INTO progress (book_id, status, last_updated) 
         VALUES (?1, ?2, ?3)
         ON CONFLICT(book_id) DO UPDATE SET 
            status = excluded.status,
            last_updated = excluded.last_updated
         WHERE excluded.last_updated >= last_updated",
        rusqlite::params![book_id, status, now],
    )?;

    Ok(())
}

pub fn get_progress(conn: &Connection, since: Option<i64>) -> Result<Vec<ProgressRecord>, AppError> {
    let mut stmt;
    let records = match since {
        Some(ts) => {
            stmt = conn.prepare("SELECT book_id, status, last_updated FROM progress WHERE last_updated >= ?1")?;
            stmt.query_map([ts], |row| {
                Ok(ProgressRecord {
                    book_id: row.get(0)?,
                    status: row.get(1)?,
                    last_updated: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        }
        None => {
            stmt = conn.prepare("SELECT book_id, status, last_updated FROM progress")?;
            stmt.query_map([], |row| {
                Ok(ProgressRecord {
                    book_id: row.get(0)?,
                    status: row.get(1)?,
                    last_updated: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        }
    };

    Ok(records)
}
