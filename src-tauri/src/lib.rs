pub mod commands;
pub mod core;
pub mod error;
pub mod http;
pub mod models;

use crate::{
    commands::{library, network},
    core::db,
    http::server,
    models::ConnectionInfo,
};
use log::{error, info};
use network_interface::{NetworkInterface, NetworkInterfaceConfig};
use rand::Rng;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_store::StoreExt;

fn get_lan_ip() -> std::net::IpAddr {
    // Try to find a non-loopback, non-virtual IP.
    if let Ok(interfaces) = NetworkInterface::show() {
        info!("Detected network interfaces:");
        for iface in &interfaces {
            for addr in &iface.addr {
                info!("  - Interface {}: {:?}", iface.name, addr.ip());
            }
        }

        // Preferred order: Ethernet/Wi-Fi (usually start with 192.168, 10, or 172.16-31)
        for iface in &interfaces {
            for addr in &iface.addr {
                let ip = addr.ip();
                if let std::net::IpAddr::V4(ipv4) = ip {
                    if ipv4.is_loopback() {
                        continue;
                    }

                    let octets = ipv4.octets();
                    // 192.168.x.x
                    if octets[0] == 192 && octets[1] == 168 {
                        info!("Selected best LAN IP: {}", ip);
                        return ip;
                    }
                    // 10.x.x.x
                    if octets[0] == 10 {
                        info!("Selected best LAN IP: {}", ip);
                        return ip;
                    }
                    // 172.16.x.x - 172.31.x.x
                    if octets[0] == 172 && (16..=31).contains(&octets[1]) {
                        info!("Selected best LAN IP: {}", ip);
                        return ip;
                    }
                }
            }
        }

        // Fallback to any non-loopback V4
        for iface in &interfaces {
            for addr in &iface.addr {
                let ip = addr.ip();
                if let std::net::IpAddr::V4(ipv4) = ip {
                    if !ipv4.is_loopback() {
                        info!("Falling back to non-loopback IP: {}", ip);
                        return ip;
                    }
                }
            }
        }
    }

    let fallback = local_ip_address::local_ip().unwrap_or_else(|_| "127.0.0.1".parse().unwrap());
    info!("Ultimate IP fallback: {}", fallback);
    fallback
}

pub struct DiscoveryState {
    hosts: Mutex<Vec<ConnectionInfo>>,
}

// wrapper for Tauri state to hold the same Arc
pub struct AppState {
    pub server: server::SharedState,
    pub discovery: Arc<DiscoveryState>,
    pub sync_manager: Mutex<Option<crate::core::sync::SyncManager>>,
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
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            server: Arc::new(server::ServerState {
                library_path: Mutex::new(None),
                books: Mutex::new(Vec::new()),
                pin: Mutex::new("0000".to_string()), // Temporary, updated in setup
                authorized_tokens: Mutex::new(std::collections::HashSet::new()),
                app_data_dir: Mutex::new(None),
            }),
            discovery: discovery_state,
            sync_manager: Mutex::new(None),
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let discovery = discovery_clone;

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app_data_dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            // 1. PIN Management (Persistence)
            let pin_path = app_data_dir.join("pin.txt");
            let pin_str = if pin_path.exists() {
                std::fs::read_to_string(&pin_path)
                    .unwrap_or_else(|_| "0000".to_string())
                    .trim()
                    .to_string()
            } else {
                let mut rng = rand::rng();
                let pin: u32 = rng.random_range(1000..10000);
                let p = pin.to_string();
                std::fs::write(&pin_path, &p).ok();
                p
            };
            info!("Server PIN: {}", pin_str);

            let app_state = app.state::<AppState>();
            {
                let mut pin = app_state.server.pin.lock().expect("Poisoned lock");
                *pin = pin_str;

                let mut data_dir = app_state.server.app_data_dir.lock().expect("Poisoned lock");
                *data_dir = Some(app_data_dir.clone());
            }

            #[cfg(desktop)]
            {
                // System Tray Setup
                let quit_i =
                    tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
                        .expect("Failed to create menu item");
                let show_i = tauri::menu::MenuItem::with_id(
                    app,
                    "show",
                    "Show ShelfSync",
                    true,
                    None::<&str>,
                )
                .expect("Failed to create menu item");
                let hide_i =
                    tauri::menu::MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)
                        .expect("Failed to create menu item");
                let menu = tauri::menu::Menu::with_items(
                    app,
                    &[
                        &show_i,
                        &hide_i,
                        &tauri::menu::PredefinedMenuItem::separator(app)
                            .expect("Failed to create separator"),
                        &quit_i,
                    ],
                )
                .expect("Failed to create menu");

                let _tray = tauri::tray::TrayIconBuilder::new()
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| match event {
                        tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            ..
                        } => {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        _ => {}
                    })
                    .build(app)
                    .expect("Failed to build tray icon");
            }

            // 2. Load Settings from persistent store
            let handle_for_setup = app.handle().clone();
            let store = handle_for_setup.store("shelfsync_settings.json");

            if let Ok(store_handle) = store {
                if let Some(path) = store_handle
                    .get("library_path")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                {
                    info!("Auto-loading library from: {}", path);
                    if let Ok(books) = db::get_calibre_metadata(&path) {
                        let mut path_lock =
                            app_state.server.library_path.lock().expect("Poisoned lock");
                        *path_lock = Some(path.to_string());

                        let mut books_lock = app_state.server.books.lock().expect("Poisoned lock");
                        *books_lock = books;
                        info!("Library auto-loaded successfully.");
                    } else {
                        error!("Failed to load metadata from saved path: {}", path);
                    }
                }
            }

            // 3. Init progress DB
            if let Err(e) = crate::core::progress::init_progress_db(&app_data_dir) {
                error!("Failed to init progress DB: {}", e);
            }

            // 4. Init Sync Manager
            let sync_mgr = crate::core::sync::SyncManager::new(app.handle().clone());
            {
                let mut sm_lock = app_state.sync_manager.lock().expect("Poisoned lock");
                *sm_lock = Some(sync_mgr);
            }

            // 5. Spawn server task
            let state_clone = app_state.server.clone();
            tauri::async_runtime::spawn(async move {
                server::run(state_clone, 8080).await;
            });

            // 6. Spawn mDNS task
            tauri::async_runtime::spawn(async move {
                let mdns = mdns_sd::ServiceDaemon::new().expect("Failed to create mDNS daemon");

                // Broadcast
                let machine_name = hostname::get()
                    .map(|h| h.to_string_lossy().to_string())
                    .unwrap_or_else(|_| "ShelfSync-Host".to_string());

                let service_type = "_shelfsync._tcp.local.";
                let instance_name = format!("{}'s Library", machine_name);
                let my_ip = get_lan_ip();
                let properties = [("version", "0.1.0")];
                let host_name = format!("{}.local.", machine_name.replace(" ", "-"));

                let service_info = mdns_sd::ServiceInfo::new(
                    service_type,
                    &instance_name,
                    &host_name,
                    my_ip.to_string(),
                    8080,
                    &properties[..],
                )
                .expect("Valid mDNS service info");

                mdns.register(service_info)
                    .expect("Failed to register mDNS service");

                // Browse
                let receiver = mdns.browse(service_type).expect("Failed to browse");
                while let Ok(event) = receiver.recv_async().await {
                    let mut updated = false;
                    match event {
                        mdns_sd::ServiceEvent::ServiceResolved(info) => {
                            let mut hosts = discovery.hosts.lock().expect("Poisoned lock");
                            let ip = info
                                .get_addresses()
                                .iter()
                                .next()
                                .map(|a| a.to_string())
                                .unwrap_or_default();
                            let hostname = info.get_fullname().to_string();

                            if !hosts.iter().any(|h| h.ip == ip) {
                                hosts.push(ConnectionInfo {
                                    ip,
                                    port: info.get_port(),
                                    hostname,
                                    pin: None,
                                });
                                updated = true;
                            }
                        }
                        mdns_sd::ServiceEvent::ServiceRemoved(_type, name) => {
                            let mut hosts = discovery.hosts.lock().expect("Poisoned lock");
                            let len_before = hosts.len();
                            hosts.retain(|h| h.hostname != name);
                            if hosts.len() != len_before {
                                updated = true;
                            }
                        }
                        _ => {}
                    }

                    if updated {
                        let hosts = discovery.hosts.lock().expect("Poisoned lock").clone();
                        if let Err(e) = handle.emit("discovery-update", hosts) {
                            error!("Failed to emit discovery update: {}", e);
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::get_books,
            library::set_library_path,
            library::start_bulk_sync,
            network::get_connection_info,
            network::discover_hosts,
            network::refresh_discovery,
            crate::commands::local_db::init_local_db,
            crate::commands::local_db::save_local_book,
            crate::commands::local_db::update_local_read_status,
            crate::commands::local_db::get_local_books
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
