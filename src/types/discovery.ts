import type { ConnectionInfo, Host } from "./core";

export interface DiscoveryContextType {
  hosts: Host[];
  knownHosts: Host[];
  myConnectionInfo: ConnectionInfo | null;
  scanning: boolean;
  scan: () => Promise<void>;
  refreshConnectionInfo: () => Promise<void>;
}
