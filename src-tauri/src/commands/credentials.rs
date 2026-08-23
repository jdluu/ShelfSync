use std::sync::Arc;

use tauri::command;

use crate::credentials::{
    CredentialAccount, CredentialStore, CredentialStoreError, InMemorySessionStore, OpdsCredentials,
};
use crate::error::AppError;

/// Shared handle to the platform credential store managed as Tauri state.
pub type SharedCredentialStore = Arc<dyn CredentialStore>;

impl From<CredentialStoreError> for AppError {
    fn from(err: CredentialStoreError) -> Self {
        AppError::Credential(err.to_string())
    }
}

fn account_from_parts(provider: String, origin: String, username: String) -> CredentialAccount {
    CredentialAccount::new(provider.trim(), origin.trim(), username.trim())
}

#[command]
pub fn opds_save_credential(
    store: tauri::State<'_, SharedCredentialStore>,
    provider: String,
    origin: String,
    username: String,
    password: String,
) -> Result<(), AppError> {
    let account = account_from_parts(provider, origin, username);
    let credentials = OpdsCredentials::new(account.username.clone(), password);
    store.save(&account, &credentials)?;
    Ok(())
}

#[command]
pub fn opds_load_credential(
    store: tauri::State<'_, SharedCredentialStore>,
    provider: String,
    origin: String,
    username: String,
) -> Result<Option<OpdsCredentials>, AppError> {
    let account = account_from_parts(provider, origin, username);
    Ok(store.load(&account)?)
}

#[command]
pub fn opds_delete_credential(
    store: tauri::State<'_, SharedCredentialStore>,
    provider: String,
    origin: String,
    username: String,
) -> Result<bool, AppError> {
    let account = account_from_parts(provider, origin, username);
    Ok(store.delete(&account)?)
}

/// Builds the store handed to Tauri state during setup. A failure to open the
/// encrypted store falls back to the session-only in-memory store so commands
/// keep responding without ever writing plaintext secrets to disk.
pub fn build_shared_store(app_data_dir: &std::path::Path) -> SharedCredentialStore {
    match crate::credentials::default_credential_store(app_data_dir.to_path_buf()) {
        Ok(store) => store,
        Err(err) => {
            log::error!("Falling back to session-only credential storage: {}", err);
            Arc::new(InMemorySessionStore::new())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_store_is_session_only_and_functional() {
        let dir = tempfile::tempdir().unwrap();
        let store = build_shared_store(dir.path());

        let account = CredentialAccount::new("grimmory", "https://books.example.com", "alice");
        store
            .save(&account, &OpdsCredentials::new("alice", "secret"))
            .unwrap();
        assert_eq!(store.load(&account).unwrap().unwrap().password, "secret");

        // No credential file may appear next to the app data directory.
        assert!(!dir.path().join("opds-credentials.json").exists());
    }

    #[test]
    fn account_parts_are_trimmed() {
        let account = account_from_parts(
            " grimmory ".to_string(),
            " https://x.com ".to_string(),
            " a ".to_string(),
        );
        assert_eq!(account.provider, "grimmory");
        assert_eq!(account.origin, "https://x.com");
        assert_eq!(account.username, "a");
    }
}
