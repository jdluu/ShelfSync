mod db;
mod server;

use std::sync::{Arc, Mutex};
use tauri::State;
use serde::Serialize;

#[derive(Serialize)]
struct ConnectionInfo {
    ip: String,
    port: u16,
    hostname: String,
}

// wrapper for Tauri state to hold the same Arc
struct AppState(server::SharedState);

#[tauri::command]
fn get_books(library_path: String) -> Result<Vec<db::Book>, String> {
    db::get_calibre_metadata(&library_path)
}

#[tauri::command]
fn set_library_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut lib_path = state.0.library_path.lock().map_err(|e| e.to_string())?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server_state = Arc::new(server::ServerState {
        library_path: Mutex::new(None),
    });
    
    // Spawn server task
    let state_clone = server_state.clone();
    tauri::async_runtime::spawn(async move {
        server::run(state_clone, 8080).await;
    });

    // mDNS Service Discovery
    tauri::async_runtime::spawn(async move {
        let mdns = mdns_sd::ServiceDaemon::new().expect("Failed to create mDNS daemon");
        let machine_name = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "ShelfSync-Host".to_string());
        
        let service_type = "_shelfsync._tcp.local.";
        let instance_name = format!("ShelfSync on {}", machine_name);
        
        // We might want to use real IP, but 0.0.0.0 works for binding usually. mDNS needs real IPs preferably.
        let my_ip = local_ip_address::local_ip().unwrap_or("127.0.0.1".parse().unwrap());
        let properties = [("version", "0.1.0")];

        println!("Broadcasting mDNS service: {} at {}:8080", instance_name, my_ip);

        let host_name = format!("{}.local.", machine_name);

        let service_info = mdns_sd::ServiceInfo::new(
            service_type,
            &instance_name,
            &host_name,
            my_ip.to_string(), // passing ip as string is deprecated in newer versions but check docs, ServiceInfo::new takes ip string or address
            8080,
            &properties[..],
        ).expect("Valid mDNS service info");

        mdns.register(service_info).expect("Failed to register mDNS service");
        
        // Keep daemon alive
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
        }
    });

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState(server_state)) // Manage the state wrapper
        .invoke_handler(tauri::generate_handler![get_books, set_library_path, get_connection_info]);

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
