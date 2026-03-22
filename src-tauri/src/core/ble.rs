use btleplug::api::{Central, Manager as _, Peripheral, ScanFilter};
use btleplug::platform::Manager;
use log::{error, info, warn};
use std::time::Duration;
use tokio::time;
use crate::models::ConnectionInfo;

const SHELFSYNC_BLE_PREFIX: &str = "ShelfSync-";

/// Passively scans for Bluetooth Low Energy devices broadcasting a ShelfSync format name.
/// This acts as a fallback when mDNS fails to discover a host.
pub async fn scan_for_hosts() -> Vec<ConnectionInfo> {
    let mut found_hosts = Vec::new();
    
    // Initialize the BLE manager
    let manager = match Manager::new().await {
        Ok(m) => m,
        Err(e) => {
            error!("Failed to initialize BLE manager: {:?}", e);
            return found_hosts;
        }
    };

    // Get the first available bluetooth adapter
    let adapters = match manager.adapters().await {
        Ok(a) => a,
        Err(_) => return found_hosts,
    };
    
    let central = match adapters.into_iter().nth(0) {
        Some(a) => a,
        None => {
            warn!("No Bluetooth adapters found for BLE discovery.");
            return found_hosts;
        }
    };

    // Start scanning
    if let Err(e) = central.start_scan(ScanFilter::default()).await {
        warn!("BLE Scan unavailable (likely busy or unsupported): {:?}", e);
        return found_hosts;
    }

    info!("Scanning for ShelfSync BLE beacons...");
    
    // Scan for 5 seconds
    time::sleep(Duration::from_secs(5)).await;

    // Collect discovered peripherals
    if let Ok(peripherals) = central.peripherals().await {
        for peripheral in peripherals {
            if let Ok(Some(properties)) = peripheral.properties().await {
                if let Some(local_name) = properties.local_name {
                    // Expect format: ShelfSync-192.168.1.5:8080
                    if local_name.starts_with(SHELFSYNC_BLE_PREFIX) {
                        let config_str = local_name.trim_start_matches(SHELFSYNC_BLE_PREFIX);
                        let parts: Vec<&str> = config_str.split(':').collect();
                        
                        if parts.len() == 2 {
                            if let Ok(port) = parts[1].parse::<u16>() {
                                info!("Discovered host via BLE fallback: {}:{}", parts[0], port);
                                found_hosts.push(ConnectionInfo {
                                    ip: parts[0].to_string(),
                                    port,
                                    hostname: "BLE Host".to_string(),
                                    pin: None, // PIN exchange would happen in HTTP handshake
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Stop scanning
    let _ = central.stop_scan().await;

    found_hosts
}

/// Advertising (Peripheral Role) placeholder.
/// Note: btleplug primarily supports the Central (scanning) role.
/// For robust BLE peripheral advertising, native implementations (Android Kotlin / Windows-rs) are recommended.
pub async fn start_advertising(_ip: &str, _port: u16) -> Result<(), String> {
    warn!("BLE Advertising is not fully supported by btleplug natively across all platforms.");
    warn!("Please use platform-specific foreground services or native bindings to advertise ShelfSync.");
    Ok(())
}

pub async fn stop_advertising() -> Result<(), String> {
    Ok(())
}
