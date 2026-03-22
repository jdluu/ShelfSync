pub mod auth;
pub mod books;
pub mod covers;
pub mod progress;
pub mod server;

use crate::models::Book;
use std::sync::{Arc, Mutex};

/// Application state shared across all HTTP handlers.
///
/// Contains the library path, book metadata, authentication PIN, and authorized tokens.
pub struct ServerState {
    /// Path to the Calibre library (e.g., "/Users/name/Calibre Library").
    pub library_path: Mutex<Option<String>>,
    /// Async database connection pool for the Calibre library.
    pub db_pool: tokio::sync::RwLock<Option<deadpool_sqlite::Pool>>,
    /// In-memory cache of book metadata.
    pub books: Mutex<Vec<Book>>,
    /// 4-digit PIN for initial device pairing.
    pub pin: Mutex<String>,
    /// Set of authorized bearer tokens.
    pub authorized_tokens: Mutex<std::collections::HashSet<String>>,
    /// Directory for storing application data (cache, settings, etc.).
    pub app_data_dir: Mutex<Option<std::path::PathBuf>>,
    /// Rate limiting for PIN brute force attempts: (failed_count, last_attempt_time)
    pub failed_pin_attempts: Mutex<(u32, std::time::Instant)>,
    /// Set of book IDs currently being resized to prevent cache stampedes.
    pub active_cover_resizes: tokio::sync::Mutex<std::collections::HashSet<i64>>,
    /// Long-lived connection to the progress tracking database.
    pub progress_db: Mutex<Option<rusqlite::Connection>>,
    /// Last modification time of the metadata.db file.
    pub last_metadata_mtime: Mutex<Option<std::time::SystemTime>>,
    /// The actual port the server is bound to.
    pub bound_port: Mutex<u16>,
    /// Whether the application is currently broadcasting its presence.
    pub is_hosting: Mutex<bool>,
    /// Handle to the Tauri application for system-level notifications.
    pub app_handle: Mutex<Option<tauri::AppHandle>>,
}

pub type SharedState = Arc<ServerState>;
