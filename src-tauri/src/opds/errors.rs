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

    #[error("Missing acquisition URL")]
    MissingAcquisitionUrl,

    #[error("Cross-origin acquisition URL: {0}")]
    CrossOriginAcquisitionUrl(String),
}

#[derive(Debug, Error, Serialize)]
pub enum AcquisitionError {
    #[error("No supported acquisition found")]
    NoSupportedAcquisition,

    #[error("Unsupported media type: {0}")]
    UnsupportedMediaType(String),

    #[error("Path traversal detected in filename for: {0}")]
    PathTraversal(String),

    #[error("Destination path escapes content root: {0}")]
    PathEscaped(String),

    #[error("Invalid content root: {0}")]
    InvalidContentRoot(String),

    #[error("No content root provided")]
    MissingContentRoot,
}

impl From<AcquisitionError> for String {
    fn from(err: AcquisitionError) -> Self {
        err.to_string()
    }
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
