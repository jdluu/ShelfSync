#[derive(Debug, thiserror::Error)]
pub enum PersistError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("connection pool error: {0}")]
    Pool(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid metadata snapshot: {0}")]
    InvalidMetadata(String),
    #[error("unsafe local path: {0}")]
    UnsafePath(String),
    #[error("invalid canonical url: {0}")]
    InvalidUrl(String),
    #[error("{0}")]
    Invalid(String),
}

impl From<deadpool_sqlite::CreatePoolError> for PersistError {
    fn from(err: deadpool_sqlite::CreatePoolError) -> Self {
        PersistError::Pool(err.to_string())
    }
}
