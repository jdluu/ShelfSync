use crate::{models::ConnectionInfo, DiscoveryState};
use log::error;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub fn spawn_mdns_task(handle: AppHandle, discovery: Arc<DiscoveryState>, my_ip: std::net::IpAddr) {
    tauri::async_runtime::spawn(async move {
        let mdns = match mdns_sd::ServiceDaemon::new() {
            Ok(d) => d,
            Err(e) => {
                error!("mDNS unavailable: {}. Discovery disabled.", e);
                return;
            }
        };

        // Broadcast
        let machine_name = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "ShelfSync-Host".to_string());

        let service_type = "_shelfsync._tcp.local.";
        let instance_name = format!("{}'s Library", machine_name);
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
                    if let Ok(mut hosts) = discovery.hosts.lock() {
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
                }
                mdns_sd::ServiceEvent::ServiceRemoved(_type, name) => {
                    if let Ok(mut hosts) = discovery.hosts.lock() {
                        let len_before = hosts.len();
                        hosts.retain(|h| h.hostname != name);
                        if hosts.len() != len_before {
                            updated = true;
                        }
                    }
                }
                _ => {}
            }

            if updated {
                let hosts = match discovery.hosts.lock() {
                    Ok(h) => h.clone(),
                    Err(_) => continue,
                };
                if let Err(e) = handle.emit("discovery-update", hosts) {
                    error!("Failed to emit discovery update: {}", e);
                }
            }
        }
    });
}
