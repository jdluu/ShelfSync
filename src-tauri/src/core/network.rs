use log::info;
use network_interface::{NetworkInterface, NetworkInterfaceConfig};

pub fn get_lan_ip() -> std::net::IpAddr {
    // Try to find a non-loopback, non-virtual IP.
    if let Ok(interfaces) = NetworkInterface::show() {
        info!("Detected network interfaces:");
        for iface in &interfaces {
            for addr in &iface.addr {
                info!("  - Interface {}: {:?}", iface.name, addr.ip());
            }
        }

        // Preferred order: Ethernet/Wi-Fi (usually start with 192.168, 10, or 172.16-31)
        for iface in &interfaces {
            for addr in &iface.addr {
                let ip = addr.ip();
                if let std::net::IpAddr::V4(ipv4) = ip {
                    if ipv4.is_loopback() {
                        continue;
                    }

                    let octets = ipv4.octets();
                    // 192.168.x.x
                    if octets[0] == 192 && octets[1] == 168 {
                        info!("Selected best LAN IP: {}", ip);
                        return ip;
                    }
                    // 10.x.x.x
                    if octets[0] == 10 {
                        info!("Selected best LAN IP: {}", ip);
                        return ip;
                    }
                    // 172.16.x.x - 172.31.x.x
                    if octets[0] == 172 && (16..=31).contains(&octets[1]) {
                        info!("Selected best LAN IP: {}", ip);
                        return ip;
                    }
                }
            }
        }

        // Fallback to any non-loopback V4
        for iface in &interfaces {
            for addr in &iface.addr {
                let ip = addr.ip();
                if let std::net::IpAddr::V4(ipv4) = ip {
                    if !ipv4.is_loopback() {
                        info!("Falling back to non-loopback IP: {}", ip);
                        return ip;
                    }
                }
            }
        }
    }

    let fallback = local_ip_address::local_ip().unwrap_or_else(|_| "127.0.0.1".parse().unwrap());
    info!("Ultimate IP fallback: {}", fallback);
    fallback
}
