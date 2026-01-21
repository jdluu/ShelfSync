use rusqlite::Connection;
use std::path::Path;
use crate::error::AppError;

#[derive(serde::Serialize)]
pub struct ProgressRecord {
    pub book_id: i64,
    pub status: String, // 'unread', 'reading', 'finished'
    pub last_updated: i64, // Unix timestamp
}

pub fn init_progress_db(app_data_dir: &Path) -> Result<(), AppError> {
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
    
    Ok(())
}

pub fn update_progress(app_data_dir: &Path, book_id: i64, status: &str) -> Result<(), AppError> {
    let db_path = app_data_dir.join("progress.db");
    let conn = Connection::open(db_path)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
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

pub fn get_all_progress(app_data_dir: &Path) -> Result<Vec<ProgressRecord>, AppError> {
    let db_path = app_data_dir.join("progress.db");
    if !db_path.exists() {
        return Ok(Vec::new());
    }
    
    let conn = Connection::open(db_path)?;
    let mut stmt = conn.prepare("SELECT book_id, status, last_updated FROM progress")?;
    
    let records = stmt.query_map([], |row| {
        Ok(ProgressRecord {
            book_id: row.get(0)?,
            status: row.get(1)?,
            last_updated: row.get(2)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;
    
    Ok(records)
}
