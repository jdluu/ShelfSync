use rusqlite::{params, Connection, OptionalExtension};

pub const CURRENT_SCHEMA_VERSION: i32 = 1;

const SCHEMA_V1_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS catalog_account (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (provider, base_url, username)
);

CREATE TABLE IF NOT EXISTS publication (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES catalog_account(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    canonical_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (account_id, provider, canonical_id)
);

CREATE TABLE IF NOT EXISTS acquisition (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publication_id INTEGER NOT NULL REFERENCES publication(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (publication_id, media_type)
);

CREATE TABLE IF NOT EXISTS file_revision (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acquisition_id INTEGER NOT NULL REFERENCES acquisition(id) ON DELETE CASCADE,
    expected_length INTEGER,
    expected_hash TEXT,
    hash_algorithm TEXT,
    local_relative_path TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS download_job (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revision_id INTEGER NOT NULL REFERENCES file_revision(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted')),
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_publication_account_available ON publication (account_id, available);
CREATE INDEX IF NOT EXISTS idx_acquisition_publication ON acquisition (publication_id);
CREATE INDEX IF NOT EXISTS idx_file_revision_acquisition ON file_revision (acquisition_id);
CREATE INDEX IF NOT EXISTS idx_download_job_state_updated ON download_job (state, updated_at);

CREATE TABLE IF NOT EXISTS persist_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    recorded_at INTEGER NOT NULL
);
"#;

const LEGACY_BOOKS_PRESENT: &str = "legacy.books.present";
const LEGACY_BOOKS_ROWS: &str = "legacy.books.rows";
const LEGACY_BOOKS_STATUS: &str = "legacy.books.status";
const LEGACY_STATUS_UNAVAILABLE: &str = "unavailable_in_new_model";

fn table_exists(conn: &Connection, name: &str) -> Result<bool, super::PersistError> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            params![name],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

fn note_legacy_books(conn: &Connection, now: i64) -> Result<(), super::PersistError> {
    if !table_exists(conn, "books")? {
        return Ok(());
    }
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM books", [], |row| row.get(0))?;
    conn.execute(
        "INSERT OR IGNORE INTO persist_meta (key, value, recorded_at) VALUES (?1, 'true', ?2)",
        params![LEGACY_BOOKS_PRESENT, now],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO persist_meta (key, value, recorded_at) VALUES (?1, ?2, ?3)",
        params![LEGACY_BOOKS_ROWS, count.to_string(), now],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO persist_meta (key, value, recorded_at) VALUES (?1, ?2, ?3)",
        params![LEGACY_BOOKS_STATUS, LEGACY_STATUS_UNAVAILABLE, now],
    )?;
    Ok(())
}

pub fn ensure_runtime_pragmas(conn: &Connection) -> Result<(), super::PersistError> {
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")?;
    Ok(())
}

pub fn run_migrations(conn: &mut Connection) -> Result<(), super::PersistError> {
    let now = super::repo::now_unix();
    let tx = conn.transaction()?;
    let version: i32 = tx.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version < 1 {
        tx.execute_batch(SCHEMA_V1_SQL)?;
        note_legacy_books(&tx, now)?;
        tx.execute_batch(&format!("PRAGMA user_version = {CURRENT_SCHEMA_VERSION};"))?;
    }
    tx.commit()?;
    Ok(())
}

pub fn meta_value(conn: &Connection, key: &str) -> Result<Option<String>, super::PersistError> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM persist_meta WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value)
}
