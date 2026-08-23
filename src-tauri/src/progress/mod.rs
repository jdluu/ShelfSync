//! Optional KOReader reading progress adapter.
//!
//! Book identity is the KOReader partial MD5 of the verified local file
//! bytes. Progress is never mapped by title, filename, local path, or
//! provider id.

pub mod identity;
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

pub use identity::{koreader_partial_md5_file, koreader_partial_md5_reader, sample_offset};
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
