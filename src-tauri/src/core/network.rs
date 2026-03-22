use log::info;
use network_interface::{NetworkInterface, NetworkInterfaceConfig};

pub fn get_lan_ip() -> std::net::IpAddr {
    if let Ok(interfaces) = NetworkInterface::show() {
        info!("Analyzing network interfaces for discovery...");
        
        // Skip common virtual/VPN interface patterns
        let virtual_prefixes = ["vEthernet", "docker", "vbox", "vmnet", "wsl", "tailscale", "zerotier", "utun", "tun", "tap"];
        
        let mut candidates = Vec::new();

        for iface in &interfaces {
            let name_lower = iface.name.to_lowercase();
            let is_virtual = virtual_prefixes.iter().any(|p| name_lower.contains(p));
            
            for addr in &iface.addr {
                if let std::net::IpAddr::V4(ipv4) = addr.ip() {
                    if ipv4.is_loopback() || ipv4.is_link_local() {
                        continue;
                    }

                    if is_virtual {
                        info!("  - Skipping virtual interface {}: {}", iface.name, ipv4);
                        continue;
                    }

                    info!("  - Found candidate interface {}: {}", iface.name, ipv4);
                    candidates.push(ipv4);
                }
            }
        }

        // Tiered selection:
        // 1. Standard home subnets (192.168.x.x)
        // 2. Class A/B private subnets (10.x.x.x, 172.16.x.x)
        // 3. Any other non-virtual V4
        
        candidates.sort_by_key(|ip| {
            let octets = ip.octets();
            if octets[0] == 192 && octets[1] == 168 { return 1; }
            if octets[0] == 10 { return 2; }
            if octets[0] == 172 && (16..=31).contains(&octets[1]) { return 3; }
            4
        });

        if let Some(best) = candidates.first() {
            info!("Selected best LAN IP: {}", best);
            return std::net::IpAddr::V4(*best);
        }
    }

    let fallback = local_ip_address::local_ip().unwrap_or_else(|_| "127.0.0.1".parse().unwrap());
    info!("Ultimate discovery IP fallback: {}", fallback);
    fallback
}
