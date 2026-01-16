pub mod commands;
pub mod core;
pub mod http;
pub mod models;
pub mod error;

use std::sync::{Arc, Mutex};
use tauri::{Manager, Emitter};
use log::{info, error};
use crate::{
    http::server,
    models::ConnectionInfo,
    commands::{library, network},
    core::db,
};

struct DiscoveryState {
    hosts: Mutex<Vec<ConnectionInfo>>,
}

// wrapper for Tauri state to hold the same Arc
pub struct AppState {
    server: server::SharedState,
    discovery: Arc<DiscoveryState>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    env_logger::init();

    let server_state = Arc::new(server::ServerState {
        library_path: Mutex::new(None),
        books: Mutex::new(Vec::new()),
    });

    let discovery_state = Arc::new(DiscoveryState {
        hosts: Mutex::new(Vec::new()),
    });
    
    // Spawn server task
    let state_clone = server_state.clone();
    tauri::async_runtime::spawn(async move {
        server::run(state_clone, 8080).await;
    });

    // Capture discovery state for the setup hook
    let discovery_clone = discovery_state.clone();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { server: server_state, discovery: discovery_state }) // Manage the state wrapper
        .setup(move |app| {
            let handle = app.handle().clone();
            let discovery = discovery_clone;

            // Initialize Server State from persistent store
            let app_state = app.state::<AppState>();
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                let settings_path = app_data_dir.join("shelfsync_settings.json");
                if settings_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(settings_path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            if let Some(path) = json.get("library_path").and_then(|v| v.as_str()) {
                                info!("Auto-loading library from: {}", path);
                                if let Ok(books) = db::get_calibre_metadata(path) {
                                    let mut path_lock = app_state.server.library_path.lock().unwrap();
                                    *path_lock = Some(path.to_string());
                                    
                                    let mut books_lock = app_state.server.books.lock().unwrap();
                                    *books_lock = books;
                                    info!("Library auto-loaded successfully.");
                                } else {
                                    error!("Failed to load metadata from saved path");
                                }
                            }
                        }
                    }
                }
            }
            
            tauri::async_runtime::spawn(async move {
                let mdns = mdns_sd::ServiceDaemon::new().expect("Failed to create mDNS daemon");
                
                // 1. Broadcast
                let machine_name = hostname::get()
                    .map(|h| h.to_string_lossy().to_string())
                    .unwrap_or_else(|_| "ShelfSync-Host".to_string());
                
                let service_type = "_shelfsync._tcp.local.";
                let instance_name = format!("ShelfSync on {}", machine_name);
                let my_ip = local_ip_address::local_ip().unwrap_or("127.0.0.1".parse().unwrap());
                let properties = [("version", "0.1.0")];
                let host_name = format!("{}.local.", machine_name);

                let service_info = mdns_sd::ServiceInfo::new(
                    service_type,
                    &instance_name,
                    &host_name,
                    my_ip.to_string(),
                    8080,
                    &properties[..],
                ).expect("Valid mDNS service info");

                mdns.register(service_info).expect("Failed to register mDNS service");
                
                // 2. Browse
                let receiver = mdns.browse(service_type).expect("Failed to browse");
                while let Ok(event) = receiver.recv_async().await {
                    let mut updated = false;
                    match event {
                        mdns_sd::ServiceEvent::ServiceResolved(info) => {
                            let mut hosts = discovery.hosts.lock().unwrap();
                            let ip = info.get_addresses().iter().next().map(|a| a.to_string()).unwrap_or_default();
                            let hostname = info.get_fullname().to_string();
                            
                            if !hosts.iter().any(|h| h.ip == ip) {
                                hosts.push(ConnectionInfo {
                                    ip,
                                    port: info.get_port(),
                                    hostname,
                                });
                                updated = true;
                            }
                        }
                        mdns_sd::ServiceEvent::ServiceRemoved(_type, name) => {
                            let mut hosts = discovery.hosts.lock().unwrap();
                            let len_before = hosts.len();
                            hosts.retain(|h| h.hostname != name);
                            if hosts.len() != len_before {
                                updated = true;
                            }
                        }
                        _ => {}
                    }

                    if updated {
                        let hosts = discovery.hosts.lock().unwrap().clone();
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
            network::get_connection_info, 
            network::discover_hosts
        ]);

    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_sql::Builder::default().build());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}