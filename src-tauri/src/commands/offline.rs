use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use tauri::command;

use crate::error::AppError;
use crate::offline::{
    check_disk_space, delete_local_content, refresh_library_metadata, DeletedContent,
    DeleteLocalError, DiskSpaceStatus, RefreshReport,
};
use crate::opds::{CatalogConfig, OpdsClient};
use crate::persist::{LibrarySnapshot, LibraryStore};

const DEFAULT_PROVIDER: &str = "opds";

/// Holds the offline library database and the content root it may touch.
///
/// The store is opened asynchronously right after startup and registered only
/// after the startup recovery pass; commands invoked before it is ready report
/// a clear error instead of observing half restored state.
pub struct OfflineLibraryState {
    pub store_slot: Arc<OnceLock<Arc<LibraryStore>>>,
    pub content_root: PathBuf,
}

impl OfflineLibraryState {
    pub fn new(content_root: PathBuf) -> Self {
        OfflineLibraryState {
            store_slot: Arc::new(OnceLock::new()),
            content_root,
        }
    }

    pub fn store(&self) -> Result<Arc<LibraryStore>, AppError> {
        self.store_slot
            .get()
            .cloned()
            .ok_or_else(|| AppError::OfflineLibrary("library store is still starting".to_string()))
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct OfflineLibraryView {
    pub snapshot: LibrarySnapshot,
}

#[command]
pub async fn list_offline_library(
    state: tauri::State<'_, OfflineLibraryState>,
) -> Result<OfflineLibraryView, AppError> {
    let store = state.store()?;
    let snapshot = store.library_snapshot().await?;
    Ok(OfflineLibraryView { snapshot })
}

#[command]
pub async fn refresh_offline_library(
    state: tauri::State<'_, OfflineLibraryState>,
    catalog_url: String,
    username: String,
    password: String,
    provider: Option<String>,
) -> Result<RefreshReport, AppError> {
    let parsed_url =
        url::Url::parse(catalog_url.trim()).map_err(|_| {
            AppError::OpdsTransport("Invalid URL: unable to parse".to_string())
        })?;
    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err(AppError::OpdsTransport(
            "Invalid URL: only HTTP and HTTPS schemes are allowed".to_string(),
        ));
    }
    if !parsed_url.username().is_empty() || parsed_url.password().is_some() {
        return Err(AppError::OpdsTransport(
            "Invalid URL: credentials must not be embedded in URL".to_string(),
        ));
    }

    let config = CatalogConfig::new(
        provider.unwrap_or_else(|| DEFAULT_PROVIDER.to_string()),
        parsed_url,
        username,
        password,
    )
    .map_err(|e| AppError::OpdsTransport(e.to_string()))?;
    let client = OpdsClient::new(config)
        .map_err(|e| AppError::OpdsTransport(e.to_string()))?;

    let store = state.store()?;
    let provider_for_refresh = client.config().provider.clone();
    let report = refresh_library_metadata(&store, &client, &provider_for_refresh)
        .await
        .map_err(|e| match e {
            crate::offline::RefreshError::Transport(inner) => AppError::OpdsTransport(inner.to_string()),
            crate::offline::RefreshError::Persist(inner) => AppError::from(inner),
        })?;
    Ok(report)
}

#[command]
pub async fn delete_offline_content(
    state: tauri::State<'_, OfflineLibraryState>,
    revision_id: i64,
) -> Result<DeletedContent, AppError> {
    let store = state.store()?;
    delete_local_content(&store, &state.content_root, revision_id)
        .await
        .map_err(|e| match e {
            DeleteLocalError::Persist(inner) => AppError::from(inner),
            other => AppError::OfflineLibrary(other.to_string()),
        })
}

#[command]
pub async fn check_download_space(
    state: tauri::State<'_, OfflineLibraryState>,
    required_bytes: u64,
) -> Result<DiskSpaceStatus, AppError> {
    check_disk_space(&state.content_root, required_bytes).map_err(|e| {
        AppError::OfflineLibrary(format!("disk space check failed: {e}"))
    })
}
