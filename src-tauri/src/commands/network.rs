use tauri::State;
use crate::{models::ConnectionInfo, AppState};

#[tauri::command]
pub fn get_connection_info(state: State<'_, AppState>) -> ConnectionInfo {
    ConnectionInfo {
        ip: local_ip_address::local_ip().unwrap_or("127.0.0.1".parse().unwrap()).to_string(),
        port: 8080,
        hostname: hostname::get().map(|h| h.to_string_lossy().to_string()).unwrap_or("Unknown".to_string()),
        pin: Some(state.server.pin.clone()),
    }
}

#[tauri::command]
pub fn discover_hosts(state: State<'_, AppState>) -> Vec<ConnectionInfo> {
    state.discovery.hosts.lock().unwrap().clone()
}
