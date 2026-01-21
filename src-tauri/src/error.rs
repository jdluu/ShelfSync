use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Library not found: {0}")]
    LibraryNotFound(String),
    
    #[error("Unknown error: {0}")]
    Unknown(String),
    
    #[error("Other error: {0}")]
    Other(String),
}

// Implement Serialize manually or via `serde_repr` if needed, 
// but for Tauri simple string serialization of the error message is often enough 
// OR we can serialize it as a struct { code, message }.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}

// Helper for simple string conversions (legacy support)
impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Unknown(s)
    }
}
