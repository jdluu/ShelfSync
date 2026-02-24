use crate::{models::ConnectionInfo, AppState};
use tauri::State;

#[tauri::command]
pub fn get_connection_info(state: State<'_, AppState>) -> ConnectionInfo {
    ConnectionInfo {
        ip: crate::get_lan_ip().to_string(),
        port: 8080,
        hostname: hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or("Unknown".to_string()),
        pin: Some(state.server.pin.lock().expect("Poisoned lock").clone()),
    }
}

#[tauri::command]
pub fn discover_hosts(state: State<'_, AppState>) -> Vec<ConnectionInfo> {
    state.discovery.hosts.lock().expect("Poisoned lock").clone()
}
