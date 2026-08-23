//! Adapter contract for progress backends.

use crate::progress::error::ProgressSyncError;
use crate::progress::model::KoReaderProgress;

/// Transport level operations of the Grimmory KOReader sync protocol.
///
/// Implementations perform no book identity mapping of their own: they only
/// ever see the KOReader partial MD5 computed over verified file bytes.
#[async_trait::async_trait]
pub trait ProgressAdapter: Send + Sync {
    /// Verifies the configured credentials via `GET /users/auth`.
    async fn authorize(&self) -> Result<(), ProgressSyncError>;

    /// Fetches stored progress for `document_hash`. Returns `Ok(None)` when
    /// the server reports that nothing was recorded (HTTP 404).
    async fn get_progress(
        &self,
        document_hash: &str,
    ) -> Result<Option<KoReaderProgress>, ProgressSyncError>;

    /// Stores `progress` via `PUT /syncs/progress`.
    async fn put_progress(&self, progress: &KoReaderProgress) -> Result<(), ProgressSyncError>;
}
