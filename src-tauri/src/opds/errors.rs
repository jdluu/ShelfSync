use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum OpdsTransportError {
    #[error("Authentication failed: invalid credentials")]
    AuthenticationFailed,

    #[error("Unauthorized: credentials rejected")]
    Unauthorized,

    #[error("Forbidden: account does not have access")]
    Forbidden,

    #[error("Not found")]
    NotFound,

    #[error("Rate limited: try again later")]
    RateLimited,

    #[error("Server error: {0}")]
    ServerError(u16),

    #[error("Request timeout after {0}s")]
    Timeout(u64),

    #[error("Invalid redirect: cross-origin not allowed")]
    InvalidRedirect,

    #[error("Credential exposure in URL")]
    CredentialInUrl,

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("Feed too large: {0} bytes")]
    FeedTooLarge(u64),

    #[error("Invalid XML: {0}")]
    InvalidXml(String),

    #[error("Network error")]
    NetworkError,
}

impl From<OpdsTransportError> for String {
    fn from(err: OpdsTransportError) -> Self {
        err.to_string()
    }
}

impl From<OpdsTransportError> for crate::error::AppError {
    fn from(err: OpdsTransportError) -> Self {
        crate::error::AppError::OpdsTransport(err.to_string())
    }
}
