//! Typed failure surface for the KOReader progress adapter.

/// Explicit failure and conflict semantics for progress sync. No variant
/// carries credential material.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ProgressSyncError {
    #[error("koreader credentials were rejected")]
    Unauthorized,
    #[error("koreader sync is forbidden for this account")]
    Forbidden,
    #[error("koreader sync server returned status {0}")]
    Server(u16),
    #[error("koreader sync server issued a redirect; refusing to follow it")]
    Redirect,
    #[error("koreader sync request timed out")]
    Timeout,
    #[error("network failure while contacting the koreader sync server")]
    Network,
    #[error("malformed response from koreader sync server: {0}")]
    Malformed(String),
    #[error("invalid koreader sync configuration: {0}")]
    InvalidConfig(String),
    #[error("invalid local progress input: {0}")]
    InvalidInput(String),
}
