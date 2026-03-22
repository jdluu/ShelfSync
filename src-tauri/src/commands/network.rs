use crate::{
    error::{lock_or_err, AppError},
    models::ConnectionInfo,
    AppState,
};
use tauri::State;

#[tauri::command]
pub fn get_connection_info(state: State<'_, AppState>) -> Result<ConnectionInfo, AppError> {
    let port = *lock_or_err(&state.server.bound_port)?;
    let ip = crate::core::network::get_lan_ip().to_string();
    
    Ok(ConnectionInfo {
        ip,
        port,
        hostname: hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or("Unknown".to_string()),
        pin: Some(lock_or_err(&state.server.pin)?.clone()),
    })
}

#[tauri::command]
pub async fn discover_hosts(state: State<'_, AppState>) -> Result<Vec<ConnectionInfo>, AppError> {
    let mut hosts = lock_or_err(&state.discovery.hosts)?.clone();
    
    if hosts.is_empty() {
        let ble_hosts = crate::core::ble::scan_for_hosts().await;
        hosts.extend(ble_hosts);
    }
    
    Ok(hosts)
}

#[tauri::command]
pub fn refresh_discovery(state: State<'_, AppState>) -> Result<(), AppError> {
    lock_or_err(&state.discovery.hosts)?.clear();
    Ok(())
}

#[tauri::command]
pub fn set_hosting_mode(
    enabled: bool,
    state: tauri::State<'_, AppState>,
    _app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    let mut hosting = state
        .server
        .is_hosting
        .lock()
        .map_err(|_| AppError::Unknown("Failed to lock hosting state".to_string()))?;
    *hosting = enabled;

    #[cfg(target_os = "android")]
    crate::core::android::set_hosting_service(&_app_handle, enabled);

    let port = *lock_or_err(&state.server.bound_port)?;
    if enabled {
        let ip = crate::core::network::get_lan_ip().to_string();
        tauri::async_runtime::spawn(async move {
            let _ = crate::core::ble::start_advertising(&ip, port).await;
        });
    } else {
        tauri::async_runtime::spawn(async move {
            let _ = crate::core::ble::stop_advertising().await;
        });
    }

    Ok(())
}

#[tauri::command]
pub fn set_auto_sync(_enabled: bool, _app_handle: tauri::AppHandle) -> Result<(), AppError> {
    #[cfg(target_os = "android")]
    crate::core::android::set_auto_sync(&_app_handle, _enabled);
    Ok(())
}
