use serde::{Serialize, Serializer};
use std::sync::{Mutex, MutexGuard};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Library not found: {0}")]
    LibraryNotFound(String),

    #[error("Internal lock error")]
    LockPoisoned,

    #[error("OPDS transport error: {0}")]
    OpdsTransport(String),

    #[error("Offline library error: {0}")]
    OfflineLibrary(String),

    #[error("Credential storage error: {0}")]
    Credential(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl From<crate::persist::PersistError> for AppError {
    fn from(err: crate::persist::PersistError) -> Self {
        AppError::OfflineLibrary(err.to_string())
    }
}

/// Safely acquires a `Mutex` lock, returning `AppError::LockPoisoned` on failure.
pub fn lock_or_err<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, AppError> {
    mutex.lock().map_err(|_| AppError::LockPoisoned)
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Unknown(s)
    }
}
