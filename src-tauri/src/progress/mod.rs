//! Optional KOReader reading progress adapter.
//!
//! Wire contract verified against the live Grimmory documentation
//! (https://grimmory.org/docs/integration/koreader and its generated API
//! reference) and against KOReader's own sync client behavior:
//!
//! - `GET {base}/users/auth` authorizes the dedicated KOReader credentials.
//! - `GET {base}/syncs/progress/{partial_md5}` returns the stored progress
//!   object or 404 when nothing was recorded for that document yet.
//! - `PUT {base}/syncs/progress` stores a progress object.
//! - Progress objects carry `timestamp` (int64), `document`, `percentage`,
//!   `progress`, `device`, and `device_id`.
//! - Every request uses HTTP Basic auth with KOReader credentials that are
//!   stored under their own provider key, never the OPDS credentials.
//! - Book identity is the KOReader partial MD5 of the verified local file
//!   bytes. Progress is never mapped by title, filename, local path, or
//!   provider id.
//!
//! Failure isolation: this module is a pure consumer of caller supplied
//! snapshots. It holds no handles into download or persistence state, so any
//! sync failure can only surface as a typed error and can never corrupt
//! download records.

pub mod adapter;
pub mod client;
pub mod error;
pub mod identity;
pub mod model;
#[cfg(test)]
mod tests;
pub mod service;
pub mod time;

use crate::credentials::CredentialAccount;

/// Provider key for KOReader credentials inside the shared credential store.
/// Deliberately distinct from the OPDS provider key so both credential sets
/// stay isolated even when origin and username are identical.
pub const KOREADER_CREDENTIAL_PROVIDER: &str = "grimmory-koreader";

/// Builds the credential account used to store and load KOReader credentials
/// for a sync server origin.
pub fn koreader_credential_account(origin: &str, username: &str) -> CredentialAccount {
    CredentialAccount::new(KOREADER_CREDENTIAL_PROVIDER, origin, username)
}

pub use adapter::ProgressAdapter;
pub use client::{KoReaderSyncClient, KoReaderSyncConfig, DEFAULT_REQUEST_TIMEOUT_SECS};
pub use error::ProgressSyncError;
pub use identity::{koreader_partial_md5_file, koreader_partial_md5_reader, sample_offset};
pub use model::{KoReaderProgress, LocalProgressSnapshot};
pub use service::{PullOutcome, ProgressSyncAccount, ProgressSyncService, PushOutcome};
pub use time::normalize_timestamp_seconds;

#[cfg(test)]
mod credential_key_tests {
    use crate::credentials::{CredentialStore, InMemorySessionStore, OpdsCredentials};

    use super::*;

    #[test]
    fn koreader_credentials_stay_isolated_from_opds_credentials() {
        let store = InMemorySessionStore::new();
        let opds = crate::credentials::CredentialAccount::new(
            "grimmory",
            "https://books.example.com",
            "alice",
        );
        let koreader = koreader_credential_account("https://books.example.com", "alice");

        assert_ne!(opds.storage_key(), koreader.storage_key());

        store
            .save(&opds, &OpdsCredentials::new("alice", "opds-secret"))
            .unwrap();
        store
            .save(&koreader, &OpdsCredentials::new("alice", "koreader-secret"))
            .unwrap();

        assert_eq!(store.load(&opds).unwrap().unwrap().password, "opds-secret");
        assert_eq!(
            store.load(&koreader).unwrap().unwrap().password,
            "koreader-secret"
        );

        // Deleting one key leaves the other untouched.
        assert!(store.delete(&koreader).unwrap());
        assert_eq!(store.load(&opds).unwrap().unwrap().password, "opds-secret");
        assert!(store.load(&koreader).unwrap().is_none());
    }
}
