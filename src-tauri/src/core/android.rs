#[cfg(target_os = "android")]

use tauri::AppHandle;

/// Controls the Android MulticastLock via JNI.
/// This is necessary for mDNS discovery to work on Android.
pub fn set_multicast_lock(_app_handle: &AppHandle, _enabled: bool) {
    #[cfg(target_os = "android")]
    {
        log::warn!("JNI setMulticastLock mocked out for Tauri 2 compatibility. Relying on BLE fallback.");
    }
}

/// Controls the Android Foreground Service for hosting via JNI.
pub fn set_hosting_service(_app_handle: &AppHandle, _enabled: bool) {
    #[cfg(target_os = "android")]
    {
        log::warn!("JNI setHostingService mocked out for Tauri 2 compatibility.");
    }
}

/// Controls the Android WorkManager for background auto-sync via JNI.
pub fn set_auto_sync(_app_handle: &AppHandle, _enabled: bool) {
    #[cfg(target_os = "android")]
    {
        log::warn!("JNI setupAutoSync mocked out for Tauri 2 compatibility.");
    }
}
