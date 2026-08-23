//! Secure storage for OPDS catalog credentials.
//!
//! Desktop builds keep credentials in memory for the current session only,
//! matching the historical behavior where the frontend passes credentials per
//! command invocation. Android builds seal credential blobs with an AES/GCM
//! key that never leaves the Android Keystore and persist only ciphertext in
//! app-private storage. Plaintext passwords are never written to disk, logs,
//! or error values.

#[cfg(target_os = "android")]
pub mod android_keystore;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

/// File name of the encrypted credential store inside the app data directory.
pub const CREDENTIALS_FILE_NAME: &str = "opds-credentials.json";

const REDACTED: &str = "***";

/// Identifies the catalog account a credential belongs to.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CredentialAccount {
    pub provider: String,
    pub origin: String,
    pub username: String,
}

impl CredentialAccount {
    pub fn new(
        provider: impl Into<String>,
        origin: impl Into<String>,
        username: impl Into<String>,
    ) -> Self {
        CredentialAccount {
            provider: provider.into(),
            origin: origin.into(),
            username: username.into(),
        }
    }

    /// Stable map key. The unit separator keeps fields unambiguous because
    /// origins cannot contain control characters after validation.
    pub fn storage_key(&self) -> String {
        format!(
            "{}\u{1f}{}\u{1f}{}",
            self.provider, self.origin, self.username
        )
    }

    pub fn validate(&self) -> Result<(), CredentialStoreError> {
        if self.provider.trim().is_empty() || self.username.trim().is_empty() {
            return Err(CredentialStoreError::InvalidAccount);
        }
        let parsed = crate::opds::ParsedOrigin::from_origin_str(&self.origin);
        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err(CredentialStoreError::InvalidAccount);
        }
        if parsed.host().is_empty() {
            return Err(CredentialStoreError::InvalidAccount);
        }
        Ok(())
    }
}

/// OPDS basic auth credentials. The password is redacted in every diagnostic
/// formatting path.
#[derive(Clone, PartialEq, Eq)]
pub struct OpdsCredentials {
    pub username: String,
    pub password: String,
}

impl OpdsCredentials {
    pub fn new(username: impl Into<String>, password: impl Into<String>) -> Self {
        OpdsCredentials {
            username: username.into(),
            password: password.into(),
        }
    }
}

impl std::fmt::Debug for OpdsCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OpdsCredentials")
            .field("username", &self.username)
            .field("password", &REDACTED)
            .finish()
    }
}

impl Serialize for OpdsCredentials {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("OpdsCredentials", 2)?;
        state.serialize_field("username", &self.username)?;
        state.serialize_field("password", &REDACTED)?;
        state.end()
    }
}

impl<'de> Deserialize<'de> for OpdsCredentials {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Raw {
            username: String,
            password: String,
        }
        let raw = Raw::deserialize(deserializer)?;
        Ok(OpdsCredentials {
            username: raw.username,
            password: raw.password,
        })
    }
}

/// Ciphertext produced by a [`CredentialCipher`]. Only opaque base64 payloads
/// are stored; the plaintext never reaches this type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SealedSecret {
    pub nonce_b64: String,
    pub ciphertext_b64: String,
}

#[derive(Debug, thiserror::Error)]
pub enum CredentialStoreError {
    #[error("credential cipher failed")]
    Cipher,
    #[error("credential storage io failed")]
    Io,
    #[error("credential storage is corrupted")]
    Corrupt,
    #[error("credential account is invalid")]
    InvalidAccount,
    #[error("secure credential storage is unavailable on this platform")]
    Unsupported,
    #[error("credential store is not initialized yet")]
    NotReady,
}

/// Seals and opens secret payloads. Implementations must keep key material
/// non-exportable (for example an Android Keystore AES/GCM key) and must not
/// embed secrets in returned error values.
pub trait CredentialCipher: Send + Sync {
    fn seal(&self, plaintext: &str) -> Result<SealedSecret, CredentialStoreError>;
    fn open(&self, sealed: &SealedSecret) -> Result<String, CredentialStoreError>;
}

/// Persists OPDS credentials keyed by catalog account.
pub trait CredentialStore: Send + Sync {
    fn save(
        &self,
        account: &CredentialAccount,
        credentials: &OpdsCredentials,
    ) -> Result<(), CredentialStoreError>;
    fn load(
        &self,
        account: &CredentialAccount,
    ) -> Result<Option<OpdsCredentials>, CredentialStoreError>;
    /// Removes one account entry and reports whether it existed.
    fn delete(&self, account: &CredentialAccount) -> Result<bool, CredentialStoreError>;
}

/// Session-scoped in-memory store used on desktop. Nothing is written to disk
/// so desktop behavior stays identical to the pre-hardening flow where the
/// frontend holds credentials only for the current session.
#[derive(Default)]
pub struct InMemorySessionStore {
    entries: Mutex<HashMap<String, OpdsCredentials>>,
}

impl InMemorySessionStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl CredentialStore for InMemorySessionStore {
    fn save(
        &self,
        account: &CredentialAccount,
        credentials: &OpdsCredentials,
    ) -> Result<(), CredentialStoreError> {
        account.validate()?;
        let mut entries = self.entries.lock().map_err(|_| CredentialStoreError::Io)?;
        entries.insert(account.storage_key(), credentials.clone());
        Ok(())
    }

    fn load(
        &self,
        account: &CredentialAccount,
    ) -> Result<Option<OpdsCredentials>, CredentialStoreError> {
        let entries = self.entries.lock().map_err(|_| CredentialStoreError::Io)?;
        Ok(entries.get(&account.storage_key()).cloned())
    }

    fn delete(&self, account: &CredentialAccount) -> Result<bool, CredentialStoreError> {
        let mut entries = self.entries.lock().map_err(|_| CredentialStoreError::Io)?;
        Ok(entries.remove(&account.storage_key()).is_some())
    }
}

/// Encrypted at-rest store. Every value is sealed by the provided cipher
/// before it touches disk; the file therefore contains no plaintext secrets.
pub struct EncryptedFileStore<C> {
    path: PathBuf,
    cipher: C,
    entries: Mutex<HashMap<String, SealedSecret>>,
}

impl<C: CredentialCipher> EncryptedFileStore<C> {
    /// Opens (or creates) the store file. A corrupted file surfaces as
    /// [`CredentialStoreError::Corrupt`] so callers can decide to recreate it
    /// instead of silently dropping saved credentials.
    pub fn open(path: PathBuf, cipher: C) -> Result<Self, CredentialStoreError> {
        let entries = Self::read_entries(&path)?;
        Ok(EncryptedFileStore {
            path,
            cipher,
            entries: Mutex::new(entries),
        })
    }

    fn read_entries(
        path: &std::path::Path,
    ) -> Result<HashMap<String, SealedSecret>, CredentialStoreError> {
        if !path.exists() {
            return Ok(HashMap::new());
        }
        let raw = std::fs::read_to_string(path).map_err(|_| CredentialStoreError::Io)?;
        if raw.trim().is_empty() {
            return Ok(HashMap::new());
        }
        serde_json::from_str(&raw).map_err(|_| CredentialStoreError::Corrupt)
    }

    fn persist(&self, entries: &HashMap<String, SealedSecret>) -> Result<(), CredentialStoreError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|_| CredentialStoreError::Io)?;
        }
        let json = serde_json::to_vec(entries).map_err(|_| CredentialStoreError::Io)?;
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, json).map_err(|_| CredentialStoreError::Io)?;
        std::fs::rename(&tmp, &self.path).map_err(|_| CredentialStoreError::Io)?;
        Ok(())
    }
}

impl<C: CredentialCipher> CredentialStore for EncryptedFileStore<C> {
    fn save(
        &self,
        account: &CredentialAccount,
        credentials: &OpdsCredentials,
    ) -> Result<(), CredentialStoreError> {
        account.validate()?;
        if credentials.password.is_empty() {
            return Err(CredentialStoreError::InvalidAccount);
        }
        let sealed = self.cipher.seal(&credentials.password)?;
        let mut entries = self.entries.lock().map_err(|_| CredentialStoreError::Io)?;
        entries.insert(account.storage_key(), sealed);
        let result = self.persist(&entries);
        if result.is_err() {
            entries.remove(&account.storage_key());
        }
        result
    }

    fn load(
        &self,
        account: &CredentialAccount,
    ) -> Result<Option<OpdsCredentials>, CredentialStoreError> {
        account.validate()?;
        let entries = self.entries.lock().map_err(|_| CredentialStoreError::Io)?;
        match entries.get(&account.storage_key()) {
            Some(sealed) => {
                let password = self.cipher.open(sealed)?;
                Ok(Some(OpdsCredentials {
                    username: account.username.clone(),
                    password,
                }))
            }
            None => Ok(None),
        }
    }

    fn delete(&self, account: &CredentialAccount) -> Result<bool, CredentialStoreError> {
        let mut entries = self.entries.lock().map_err(|_| CredentialStoreError::Io)?;
        let removed = entries.remove(&account.storage_key());
        let result = self.persist(&entries);
        // Report deletion success even if persistence failed? No: the caller
        // must know the on-disk state is uncertain, but the in-memory entry is
        // gone either way. Surface the persistence failure.
        result?;
        Ok(removed.is_some())
    }
}

/// Deterministic XOR plus base64 cipher standing in for a keystore during
/// tests. Two instances with different keys cannot read each other's blobs,
/// which mirrors losing the Android Keystore entry after reinstall.
pub struct MockKeystoreCipher {
    key: u8,
}

impl MockKeystoreCipher {
    pub fn new(key: u8) -> Self {
        MockKeystoreCipher { key }
    }
}

impl Default for MockKeystoreCipher {
    fn default() -> Self {
        MockKeystoreCipher::new(0x5a)
    }
}

impl CredentialCipher for MockKeystoreCipher {
    fn seal(&self, plaintext: &str) -> Result<SealedSecret, CredentialStoreError> {
        use base64::Engine;
        let engine = base64::engine::general_purpose::STANDARD;
        let sealed_bytes: Vec<u8> = plaintext.as_bytes().iter().map(|b| b ^ self.key).collect();
        Ok(SealedSecret {
            nonce_b64: engine.encode([self.key]),
            ciphertext_b64: engine.encode(sealed_bytes),
        })
    }

    fn open(&self, sealed: &SealedSecret) -> Result<String, CredentialStoreError> {
        use base64::Engine;
        let engine = base64::engine::general_purpose::STANDARD;
        let nonce = engine
            .decode(&sealed.nonce_b64)
            .map_err(|_| CredentialStoreError::Corrupt)?;
        if nonce.first() != Some(&self.key) {
            return Err(CredentialStoreError::Cipher);
        }
        let sealed_bytes = engine
            .decode(&sealed.ciphertext_b64)
            .map_err(|_| CredentialStoreError::Corrupt)?;
        let opened: Vec<u8> = sealed_bytes.iter().map(|b| b ^ self.key).collect();
        String::from_utf8(opened).map_err(|_| CredentialStoreError::Corrupt)
    }
}

/// Builds the platform credential store.
///
/// Desktop returns the session-only in-memory store. Android returns the
/// encrypted file store keyed by an Android Keystore AES/GCM key.
pub fn default_credential_store(
    app_data_dir: PathBuf,
) -> Result<std::sync::Arc<dyn CredentialStore>, CredentialStoreError> {
    #[cfg(target_os = "android")]
    {
        let cipher = android_keystore::AndroidKeystoreCipher::connect()?;
        let path = app_data_dir.join(CREDENTIALS_FILE_NAME);
        Ok(std::sync::Arc::new(EncryptedFileStore::open(path, cipher)?))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app_data_dir;
        Ok(std::sync::Arc::new(InMemorySessionStore::new()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PASSWORD: &str = "hunter2-super-secret";

    fn account() -> CredentialAccount {
        CredentialAccount::new("grimmory", "https://books.example.com", "alice")
    }

    #[test]
    fn mock_cipher_roundtrips_plaintext() {
        let cipher = MockKeystoreCipher::default();
        let sealed = cipher.seal(PASSWORD).unwrap();
        assert_ne!(sealed.ciphertext_b64, PASSWORD);
        assert!(!sealed.ciphertext_b64.contains(PASSWORD));
        assert_eq!(cipher.open(&sealed).unwrap(), PASSWORD);
    }

    #[test]
    fn mock_cipher_rejects_foreign_key_blobs() {
        let sealed = MockKeystoreCipher::new(1).seal(PASSWORD).unwrap();
        let err = MockKeystoreCipher::new(2).open(&sealed).unwrap_err();
        assert!(matches!(err, CredentialStoreError::Cipher));
    }

    #[test]
    fn mock_cipher_detects_tampered_ciphertext() {
        let cipher = MockKeystoreCipher::default();
        let mut sealed = cipher.seal(PASSWORD).unwrap();
        sealed.ciphertext_b64 = "!!!not-base64!!!".to_string();
        assert!(matches!(
            cipher.open(&sealed),
            Err(CredentialStoreError::Corrupt)
        ));
    }

    #[test]
    fn credentials_debug_and_json_redact_password() {
        let creds = OpdsCredentials::new("alice", PASSWORD);

        let debug = format!("{creds:?}");
        assert!(
            !debug.contains(PASSWORD),
            "password leaked in debug: {debug}"
        );
        assert!(debug.contains("***"));

        let json = serde_json::to_string(&creds).unwrap();
        assert!(!json.contains(PASSWORD), "password leaked in json: {json}");
    }

    #[test]
    fn in_memory_store_roundtrip_and_delete() {
        let store = InMemorySessionStore::new();
        assert!(store.load(&account()).unwrap().is_none());

        store
            .save(&account(), &OpdsCredentials::new("alice", PASSWORD))
            .unwrap();
        let loaded = store.load(&account()).unwrap().unwrap();
        assert_eq!(loaded.username, "alice");
        assert_eq!(loaded.password, PASSWORD);

        assert!(store.delete(&account()).unwrap());
        assert!(!store.delete(&account()).unwrap());
        assert!(store.load(&account()).unwrap().is_none());
    }

    #[test]
    fn accounts_are_isolated_by_provider_origin_and_username() {
        let store = InMemorySessionStore::new();
        let base = account();
        let other = CredentialAccount::new("grimmory", "https://other.example.com", "alice");

        store
            .save(&base, &OpdsCredentials::new("alice", PASSWORD))
            .unwrap();
        assert!(store.load(&other).unwrap().is_none());

        store
            .save(&other, &OpdsCredentials::new("alice", "second"))
            .unwrap();
        assert_eq!(store.load(&base).unwrap().unwrap().password, PASSWORD);
        assert_eq!(store.load(&other).unwrap().unwrap().password, "second");
    }

    #[test]
    fn invalid_accounts_are_rejected() {
        let store = InMemorySessionStore::new();
        let bad_origin = CredentialAccount::new("grimmory", "ftp://books.example.com", "alice");
        let empty_host = CredentialAccount::new("grimmory", "https://", "alice");
        assert!(matches!(
            store.save(&bad_origin, &OpdsCredentials::new("alice", PASSWORD)),
            Err(CredentialStoreError::InvalidAccount)
        ));
        assert!(matches!(
            store.save(&empty_host, &OpdsCredentials::new("alice", PASSWORD)),
            Err(CredentialStoreError::InvalidAccount)
        ));
    }

    #[test]
    fn encrypted_file_store_roundtrips_across_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CREDENTIALS_FILE_NAME);

        {
            let store =
                EncryptedFileStore::open(path.clone(), MockKeystoreCipher::default()).unwrap();
            store
                .save(&account(), &OpdsCredentials::new("alice", PASSWORD))
                .unwrap();
        }

        let reopened =
            EncryptedFileStore::open(path.clone(), MockKeystoreCipher::default()).unwrap();
        let loaded = reopened.load(&account()).unwrap().unwrap();
        assert_eq!(loaded.password, PASSWORD);
    }

    #[test]
    fn encrypted_file_store_never_writes_plaintext_to_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CREDENTIALS_FILE_NAME);
        let store = EncryptedFileStore::open(path.clone(), MockKeystoreCipher::default()).unwrap();

        store
            .save(&account(), &OpdsCredentials::new("alice", PASSWORD))
            .unwrap();

        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(!raw.contains(PASSWORD), "plaintext persisted to disk");
        assert!(
            raw.contains("grimmory"),
            "storage key should remain readable"
        );
    }

    #[test]
    fn encrypted_file_store_delete_updates_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CREDENTIALS_FILE_NAME);
        let store = EncryptedFileStore::open(path.clone(), MockKeystoreCipher::default()).unwrap();
        store
            .save(&account(), &OpdsCredentials::new("alice", PASSWORD))
            .unwrap();

        assert!(store.delete(&account()).unwrap());
        assert!(!store.delete(&account()).unwrap());

        let reopened = EncryptedFileStore::open(path, MockKeystoreCipher::default()).unwrap();
        assert!(reopened.load(&account()).unwrap().is_none());
    }

    #[test]
    fn encrypted_file_store_reports_keystore_loss_as_cipher_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CREDENTIALS_FILE_NAME);
        let store = EncryptedFileStore::open(path.clone(), MockKeystoreCipher::new(1)).unwrap();
        store
            .save(&account(), &OpdsCredentials::new("alice", PASSWORD))
            .unwrap();
        drop(store);

        // Reopening with a different keystore key models reinstall or
        // keystore invalidation: the blob exists but can no longer open.
        let store = EncryptedFileStore::open(path, MockKeystoreCipher::new(2)).unwrap();
        assert!(matches!(
            store.load(&account()),
            Err(CredentialStoreError::Cipher)
        ));
    }

    #[test]
    fn encrypted_file_store_rejects_empty_password() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CREDENTIALS_FILE_NAME);
        let store = EncryptedFileStore::open(path, MockKeystoreCipher::default()).unwrap();
        assert!(matches!(
            store.save(&account(), &OpdsCredentials::new("alice", "")),
            Err(CredentialStoreError::InvalidAccount)
        ));
    }

    #[test]
    fn corrupted_store_file_is_reported_not_swallowed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CREDENTIALS_FILE_NAME);
        std::fs::write(&path, "{ definitely not json").unwrap();

        let err = match EncryptedFileStore::<MockKeystoreCipher>::open(
            path,
            MockKeystoreCipher::default(),
        ) {
            Ok(_) => panic!("corrupted store must not open"),
            Err(err) => err,
        };
        assert!(matches!(err, CredentialStoreError::Corrupt));
    }

    #[test]
    fn default_credential_store_is_session_only_on_desktop() {
        let store = default_credential_store(std::env::temp_dir()).unwrap();
        store
            .save(&account(), &OpdsCredentials::new("alice", PASSWORD))
            .unwrap();
        assert_eq!(store.load(&account()).unwrap().unwrap().password, PASSWORD);

        // Desktop never writes the credential file anywhere.
        assert!(!std::env::temp_dir().join(CREDENTIALS_FILE_NAME).exists());
    }
}
