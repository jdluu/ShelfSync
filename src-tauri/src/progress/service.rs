//! Conflict aware orchestration on top of the progress transport.
//!
//! Semantics:
//!
//! - Sync only runs for accounts where the user enabled it; a disabled
//!   account short circuits before any network activity.
//! - All timestamp comparisons happen after normalizing seconds versus
//!   milliseconds (see [`normalize_timestamp_seconds`]).
//! - Pulling adopts the remote position only when the remote record is
//!   strictly newer than the local snapshot; a newer local snapshot is a
//!   conflict that leaves the decision to the caller instead of silently
//!   overwriting either side.
//! - Pushing never clobbers a strictly newer remote record and skips
//!   redundant writes when timestamps match.
//! - Every failure path returns a typed error from
//!   [`ProgressSyncError`]; the service holds no download or persistence
//!   state, so sync failures cannot corrupt download records.

use crate::progress::adapter::ProgressAdapter;
use crate::progress::error::ProgressSyncError;
use crate::progress::model::{KoReaderProgress, LocalProgressSnapshot};
use crate::progress::time::{normalize_timestamp_seconds, unix_now};

/// Per account opt in state plus the device identity reported to the server.
#[derive(Debug, Clone)]
pub struct ProgressSyncAccount {
    /// Push/pull runs only when the user enabled sync for this account.
    pub enabled: bool,
    pub device_name: String,
    pub device_id: String,
}

impl ProgressSyncAccount {
    /// Convenience builder used by callers wiring UI settings together.
    pub fn new(device_name: impl Into<String>, device_id: impl Into<String>) -> Self {
        ProgressSyncAccount {
            enabled: false,
            device_name: device_name.into(),
            device_id: device_id.into(),
        }
    }
}

/// Result of pulling remote progress for one document hash.
#[derive(Debug, Clone, PartialEq)]
pub enum PullOutcome {
    /// The account has progress sync disabled; no request was made.
    Disabled,
    /// The server has no stored progress for this document.
    NoRemoteProgress,
    /// Remote is strictly newer; the returned progress should be applied.
    RemoteNewer(KoReaderProgress),
    /// Conflict: local is strictly newer, remote was left untouched.
    LocalNewer(KoReaderProgress),
    /// Both sides carry the same normalized timestamp.
    InSync,
}

/// Result of pushing local progress for one document hash.
#[derive(Debug, Clone, PartialEq)]
pub enum PushOutcome {
    /// The account has progress sync disabled; no request was made.
    Disabled,
    /// The server accepted the local position.
    Pushed,
    /// Timestamps matched after normalization; nothing was written.
    NoChange,
    /// Conflict: remote is strictly newer; the push was suppressed.
    RemoteNewer(KoReaderProgress),
}

pub struct ProgressSyncService;

impl ProgressSyncService {
    /// Verifies credentials against `GET /users/auth`, useful when saving
    /// account settings.
    pub async fn check_connection(
        adapter: &dyn ProgressAdapter,
    ) -> Result<(), ProgressSyncError> {
        adapter.authorize().await
    }

    pub async fn pull(
        adapter: &dyn ProgressAdapter,
        account: &ProgressSyncAccount,
        document_hash: &str,
        local: &LocalProgressSnapshot,
    ) -> Result<PullOutcome, ProgressSyncError> {
        if !account.enabled {
            return Ok(PullOutcome::Disabled);
        }
        let remote = match adapter.get_progress(document_hash).await? {
            None => return Ok(PullOutcome::NoRemoteProgress),
            Some(remote) => remote,
        };
        let remote_ts = normalize_timestamp_seconds(remote.timestamp);
        let local_ts = local
            .updated_at_unix_seconds
            .map(normalize_timestamp_seconds);
        Ok(match local_ts {
            Some(ts) if ts > remote_ts => PullOutcome::LocalNewer(remote),
            Some(ts) if ts == remote_ts => PullOutcome::InSync,
            // Without any local record the remote position wins.
            _ => PullOutcome::RemoteNewer(remote),
        })
    }

    pub async fn push(
        adapter: &dyn ProgressAdapter,
        account: &ProgressSyncAccount,
        document_hash: &str,
        local: &LocalProgressSnapshot,
    ) -> Result<PushOutcome, ProgressSyncError> {
        if !account.enabled {
            return Ok(PushOutcome::Disabled);
        }
        let percentage = local.percentage.ok_or_else(|| {
            ProgressSyncError::InvalidInput("local percentage is unavailable".to_string())
        })?;
        if !percentage.is_finite() {
            return Err(ProgressSyncError::InvalidInput(
                "local percentage must be finite".to_string(),
            ));
        }
        let updated_at = local.updated_at_unix_seconds.unwrap_or_else(unix_now);

        if let Some(remote) = adapter.get_progress(document_hash).await? {
            let remote_ts = normalize_timestamp_seconds(remote.timestamp);
            let local_ts = normalize_timestamp_seconds(updated_at);
            if local_ts < remote_ts {
                return Ok(PushOutcome::RemoteNewer(remote));
            }
            if local_ts == remote_ts {
                return Ok(PushOutcome::NoChange);
            }
        }

        let payload = KoReaderProgress {
            timestamp: updated_at,
            document: document_hash.to_string(),
            percentage: Some(percentage.clamp(0.0, 1.0)),
            progress: local.position.clone(),
            device: Some(account.device_name.clone()),
            device_id: Some(account.device_id.clone()),
        };
        adapter.put_progress(&payload).await?;
        Ok(PushOutcome::Pushed)
    }
}
