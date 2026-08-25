pub mod commands;
pub mod core;
pub mod credentials;
pub mod error;
pub mod offline;
pub mod opds;
pub mod persist;

use log::{error, info};
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub app_data_dir: Mutex<Option<std::path::PathBuf>>,
}

fn offline_state_new(
    content_root: std::path::PathBuf,
) -> crate::commands::offline::OfflineLibraryState {
    crate::commands::offline::OfflineLibraryState::new(content_root)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // Initialize rustls crypto provider
    #[cfg(any(target_os = "android", target_os = "ios"))]
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install default crypto provider");

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            app_data_dir: Mutex::new(None),
        })
        .setup(move |app| {
            let handle = app.handle().clone();

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app_data_dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            let app_state = app.state::<AppState>();

            if let Ok(mut lock) = app_state.app_data_dir.lock() {
                *lock = Some(app_data_dir.clone());
            }

            // Init offline library state (store opens asynchronously below).
            let offline_content_root = app_data_dir.join("offline-library").join("content");
            if let Err(e) = std::fs::create_dir_all(&offline_content_root) {
                error!("Failed to create offline content root: {}", e);
            }
            let offline_state = offline_state_new(offline_content_root.clone());
            handle.manage(offline_state);
            let offline_store_slot = app
                .state::<crate::commands::offline::OfflineLibraryState>()
                .store_slot
                .clone();
            let store_path = app_data_dir.join("offline-library").join("client.db");
            tauri::async_runtime::spawn(async move {
                let store = match persist::LibraryStore::open(&store_path).await {
                    Ok(store) => store,
                    Err(e) => {
                        error!("Failed to open offline library store: {}", e);
                        return;
                    }
                };
                match crate::offline::restore_library_on_startup(&store, &offline_content_root)
                    .await
                {
                    Ok(recovery) => {
                        if recovery.recovered_jobs > 0 || !recovery.removed_part_files.is_empty() {
                            info!(
                                "Offline library startup recovery: {} jobs interrupted, {} stale part files removed",
                                recovery.recovered_jobs,
                                recovery.removed_part_files.len()
                            );
                        }
                    }
                    Err(e) => error!("Offline library startup recovery failed: {}", e),
                }
                let _ = offline_store_slot.set(std::sync::Arc::new(store));
            });

            // Init secure OPDS credential store.
            // Desktop: session-only in-memory store. Android: encrypted file
            // store keyed by an Android Keystore AES/GCM key.
            handle.manage(commands::credentials::build_shared_store(&app_data_dir));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::commands::opds::catalog::fetch_opds_catalog,
            crate::commands::opds::download::download_opds_publication,
            crate::commands::opds::download::opds_cancel_download,
            crate::commands::offline::list_offline_library,
            crate::commands::offline::refresh_offline_library,
            crate::commands::offline::delete_offline_content,
            crate::commands::offline::check_download_space,
            crate::commands::credentials::opds_save_credential,
            crate::commands::credentials::opds_load_credential,
            crate::commands::credentials::opds_delete_credential,
            crate::commands::saved_catalogs::opds_list_saved_catalogs,
            crate::commands::saved_catalogs::opds_save_catalog,
            crate::commands::saved_catalogs::opds_delete_catalog
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
