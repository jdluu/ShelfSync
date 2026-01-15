mod db;
mod server;

use std::sync::{Arc, Mutex};
use tauri::State;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
struct ConnectionInfo {
    ip: String,
    port: u16,
    hostname: String,
}

struct DiscoveryState {
    hosts: Mutex<Vec<ConnectionInfo>>,
}

// wrapper for Tauri state to hold the same Arc
struct AppState {
    server: server::SharedState,
    discovery: Arc<DiscoveryState>,
}

#[tauri::command]
fn get_books(library_path: String) -> Result<Vec<db::Book>, String> {
    db::get_calibre_metadata(&library_path)
}

#[tauri::command]
fn set_library_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut lib_path = state.server.library_path.lock().map_err(|e| e.to_string())?;
    *lib_path = Some(path);
    Ok(())
}

#[tauri::command]
fn get_connection_info() -> ConnectionInfo {
    ConnectionInfo {
        ip: local_ip_address::local_ip().unwrap_or("127.0.0.1".parse().unwrap()).to_string(),
        port: 8080,
        hostname: hostname::get().map(|h| h.to_string_lossy().to_string()).unwrap_or("Unknown".to_string()),
    }
}

#[tauri::command]
fn discover_hosts(state: State<'_, AppState>) -> Vec<ConnectionInfo> {
    state.discovery.hosts.lock().unwrap().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server_state = Arc::new(server::ServerState {
        library_path: Mutex::new(None),
    });

    let discovery_state = Arc::new(DiscoveryState {
        hosts: Mutex::new(Vec::new()),
    });
    
    // Spawn server task
    let state_clone = server_state.clone();
    tauri::async_runtime::spawn(async move {
        server::run(state_clone, 8080).await;
    });

    // mDNS Service Discovery (Broadcast & Browse)
    let discovery_clone = discovery_state.clone();
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
            match event {
                mdns_sd::ServiceEvent::ServiceResolved(info) => {
                    let mut hosts = discovery_clone.hosts.lock().unwrap();
                    let ip = info.get_addresses().iter().next().map(|a| a.to_string()).unwrap_or_default();
                    let hostname = info.get_fullname().to_string();
                    
                    if !hosts.iter().any(|h| h.ip == ip) {
                        hosts.push(ConnectionInfo {
                            ip,
                            port: info.get_port(),
                            hostname,
                        });
                    }
                }
                mdns_sd::ServiceEvent::ServiceRemoved(_type, name) => {
                    let mut hosts = discovery_clone.hosts.lock().unwrap();
                    hosts.retain(|h| h.hostname != name);
                }
                _ => {}
            }
        }
    });

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { server: server_state, discovery: discovery_state }) // Manage the state wrapper
        .invoke_handler(tauri::generate_handler![get_books, set_library_path, get_connection_info, discover_hosts]);

    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_sql::Builder::default().build());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_books_command() {
        // This is a thin wrapper, but we can test it with a non-existent path
        let result = get_books("/non/existent/path".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("metadata.db not found"));
    }
}
