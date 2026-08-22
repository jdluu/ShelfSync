pub mod commands;
pub mod core;
pub mod error;
pub mod http;
pub mod models;
pub mod opds;

use crate::{
    commands::{library, network},
    core::db,
    models::ConnectionInfo,
};
use log::{error, info};
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct DiscoveryState {
    pub hosts: Mutex<Vec<ConnectionInfo>>,
}

// wrapper for Tauri state to hold the same Arc
pub struct AppState {
    pub server: http::SharedState,
    pub discovery: Arc<DiscoveryState>,
    pub sync_manager: Mutex<Option<crate::core::sync::SyncManager>>,
    pub search_engine: Mutex<Option<crate::core::search::SearchEngine>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // Initialize rustls crypto provider
    #[cfg(any(target_os = "android", target_os = "ios"))]
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install default crypto provider");

    let discovery_state = Arc::new(DiscoveryState {
        hosts: Mutex::new(Vec::new()),
    });

    let discovery_clone = discovery_state.clone();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            server: Arc::new(http::ServerState {
                library_path: Mutex::new(None),
                db_pool: tokio::sync::RwLock::new(None),
                books: Mutex::new(Vec::new()),
                pin: Mutex::new("0000".to_string()), // Temporary, updated in setup
                authorized_tokens: Mutex::new(std::collections::HashSet::new()),
                app_data_dir: Mutex::new(None),
                failed_pin_attempts: Mutex::new((0, std::time::Instant::now())),
                active_cover_resizes: tokio::sync::Mutex::new(std::collections::HashSet::new()),
                progress_db: Mutex::new(None),
                last_metadata_mtime: Mutex::new(None),
                bound_port: Mutex::new(8080),
                is_hosting: Mutex::new(false),
                app_handle: Mutex::new(None),
            }),
            discovery: discovery_state,
            sync_manager: Mutex::new(None),
            search_engine: Mutex::new(None),
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let discovery = discovery_clone;

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app_data_dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            // Init Search Engine
            let search_dir = app_data_dir.join("tantivy_index");
            let app_state = app.state::<AppState>();
            if let Ok(search_engine) = crate::core::search::SearchEngine::new(search_dir) {
                if let Ok(mut lock) = app_state.search_engine.lock() {
                    *lock = Some(search_engine);
                }
            } else {
                error!("Failed to initialize Tantivy Search Engine");
            }

            // Init App Handle in state
            if let Ok(mut lock) = app_state.server.app_handle.lock() {
                *lock = Some(handle.clone());
            }

            // 1. PIN Management (Persistence)
            let pin_path = app_data_dir.join("pin.txt");
            let pin_str = if pin_path.exists() {
                let raw = std::fs::read_to_string(&pin_path).unwrap_or_else(|_| "0000".to_string());
                let trimmed = raw.trim().replace('"', "").to_string();
                info!("Loaded PIN from persistence");
                trimmed
            } else {
                let pin: u32 = rand::random_range(1000..10000);
                let p = pin.to_string();
                info!("Generated new PIN");
                std::fs::write(&pin_path, &p).ok();
                p
            };
            info!("Server PIN initialized.");

            {
                match app_state.server.pin.lock() {
                    Ok(mut pin) => *pin = pin_str,
                    Err(e) => error!("Failed to set PIN: {}", e),
                }

                match app_state.server.app_data_dir.lock() {
                    Ok(mut data_dir) => *data_dir = Some(app_data_dir.clone()),
                    Err(e) => error!("Failed to set app data dir: {}", e),
                }
            }

            #[cfg(desktop)]
            {
                if let Err(e) = crate::core::tray::setup_tray(app) {
                    error!("Failed to setup tray icon: {}", e);
                }
            }

            // 2. Load Settings from persistent store (Async)
            let server_state = app.state::<AppState>().server.clone();
            let handle_for_load = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_store::StoreExt;
                match handle_for_load.store("shelfsync_settings.json") {
                    Ok(store_handle) => {
                        if let Some(path) = store_handle
                            .get("library_path")
                            .and_then(|v| v.as_str().map(|s| s.to_string()))
                        {
                            let db_path = std::path::Path::new(&path).join("metadata.db");
                            if db_path.exists() {
                                let mut cfg = deadpool_sqlite::Config::new(&db_path);
                                let mut pool_config = deadpool_sqlite::PoolConfig::default();
                                pool_config.max_size = 16;
                                cfg.pool = Some(pool_config);
                                if let Ok(pool) = cfg
                                    .builder(deadpool_sqlite::Runtime::Tokio1)
                                    .unwrap()
                                    .build()
                                {
                                    match db::get_calibre_metadata(&pool).await {
                                        Ok(books) => {
                                            if let Ok(mut path_lock) =
                                                server_state.library_path.lock()
                                            {
                                                *path_lock = Some(path.to_string());
                                            }

                                            if let Ok(mut books_lock) = server_state.books.lock() {
                                                *books_lock = books;
                                            }

                                            let mut pool_lock = server_state.db_pool.write().await;
                                            *pool_lock = Some(pool);
                                        }
                                        Err(e) => {
                                            log::error!(
                                                "[AUTO-LOAD] Failed to load metadata: {:?}",
                                                e
                                            );
                                        }
                                    }
                                } else {
                                    log::error!("[AUTO-LOAD] Failed to build deadpool sqlite pool");
                                }
                            } else {
                                log::error!("[AUTO-LOAD] metadata.db not found at {:?}", db_path);
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("[AUTO-LOAD] Failed to open settings store: {:?}", e);
                    }
                }
            });

            // 3. Init progress DB
            match crate::core::progress::init_progress_db(&app_data_dir) {
                Ok(conn) => {
                    if let Ok(mut lock) = app_state.server.progress_db.lock() {
                        *lock = Some(conn);
                    }
                }
                Err(e) => error!("Failed to init progress DB: {}", e),
            }

            // 4. Init Sync Manager
            let sync_mgr = crate::core::sync::SyncManager::new(app.handle().clone());
            match app_state.sync_manager.lock() {
                Ok(mut sm_lock) => *sm_lock = Some(sync_mgr),
                Err(e) => error!("Failed to init sync manager: {}", e),
            }

            // 5. Spawn server task and get bound port
            let state_clone = app_state.server.clone();
            let server_handle = app.handle().clone();

            // We need to wait for the server to start to know what port it bound to
            let (tx, rx) = std::sync::mpsc::channel();

            tauri::async_runtime::spawn(async move {
                let result = http::server::run(state_clone, 8080, server_handle).await;
                let _ = tx.send(result);
            });

            let bound_port = match rx.recv() {
                Ok(Ok(port)) => {
                    if let Ok(mut lock) = app_state.server.bound_port.lock() {
                        *lock = port;
                    }
                    port
                }
                _ => {
                    error!("Failed to start server completely. Defaulting to 8080 for mDNS.");
                    8080
                }
            };

            // 6. Spawn mDNS task with the actual bound port
            let my_ip = crate::core::network::get_lan_ip();
            crate::core::mdns::spawn_mdns_task(handle, discovery, my_ip, bound_port);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::get_books,
            library::set_library_path,
            library::get_default_storage_path,
            library::start_bulk_sync,
            library::search_contents,
            network::get_connection_info,
            network::discover_hosts,
            network::refresh_discovery,
            network::set_hosting_mode,
            network::set_auto_sync,
            crate::commands::local_db::init_local_db,
            crate::commands::local_db::save_local_book,
            crate::commands::local_db::update_local_read_status,
            crate::commands::local_db::get_local_books,
            crate::commands::local_db::delete_local_book
        ]);

    builder
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // If it's the main window, we hide it instead of closing
                if window.label() == "main" {
                    #[cfg(target_os = "android")]
                    let _ = api;

                    #[cfg(not(target_os = "android"))]
                    {
                        window.hide().unwrap();
                        api.prevent_close();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
