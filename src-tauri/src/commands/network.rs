use crate::{
    error::{lock_or_err, AppError},
    models::ConnectionInfo,
    AppState,
};
use tauri::State;

#[tauri::command]
pub fn get_connection_info(state: State<'_, AppState>) -> Result<ConnectionInfo, AppError> {
    Ok(ConnectionInfo {
        ip: crate::core::network::get_lan_ip().to_string(),
        port: 8080,
        hostname: hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or("Unknown".to_string()),
        pin: Some(lock_or_err(&state.server.pin)?.clone()),
    })
}

#[tauri::command]
pub fn discover_hosts(state: State<'_, AppState>) -> Result<Vec<ConnectionInfo>, AppError> {
    Ok(lock_or_err(&state.discovery.hosts)?.clone())
}

#[tauri::command]
pub fn refresh_discovery(state: State<'_, AppState>) -> Result<(), AppError> {
    lock_or_err(&state.discovery.hosts)?.clear();
    Ok(())
}
