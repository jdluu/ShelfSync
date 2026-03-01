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
    /// In-memory cache of book metadata.
    pub books: Mutex<Vec<Book>>,
    /// 4-digit PIN for initial device pairing.
    pub pin: Mutex<String>,
    /// Set of authorized bearer tokens.
    pub authorized_tokens: Mutex<std::collections::HashSet<String>>,
    /// Directory for storing application data (cache, settings, etc.).
    pub app_data_dir: Mutex<Option<std::path::PathBuf>>,
}

pub type SharedState = Arc<ServerState>;
