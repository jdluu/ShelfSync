import { ChevronRight, Globe, Plus, RefreshCw, Search, WifiOff } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useDiscoveryStore } from "@/store/discoveryStore";

interface Host {
  ip: string;
  port: number;
  hostname: string;
}

const getCleanHostname = (hostname: string) => {
  return hostname
    .replace(/'s Library\._shelfsync\._tcp\.local\.?$/i, "")
    .replace(/\._shelfsync\._tcp\.local\.?$/i, "");
};

const deduplicateHosts = (hostList: Host[]) => {
  return hostList.reduce((acc, current) => {
    const cleanName = getCleanHostname(current.hostname);
    const existingIdx = acc.findIndex((h) => getCleanHostname(h.hostname) === cleanName);

    if (existingIdx === -1) {
      acc.push(current);
    } else {
      const existing = acc[existingIdx];
      // Prefer IPv4 over IPv6 if duplicate hostnames found
      if (existing && current.ip.includes(".") && existing.ip.includes(":")) {
        acc[existingIdx] = current;
      }
    }
    return acc;
  }, [] as Host[]);
};

interface DiscoveryProps {
  onConnect: (host: Host) => void;
}

export const Discovery: React.FC<DiscoveryProps> = ({ onConnect }) => {
  const { hosts, scanning, scan, knownHosts } = useDiscoveryStore();
  const [manualIp, setManualIp] = useState("");
  const [manualPort, setManualPort] = useState("8080");

  const handleManualConnect = () => {
    if (manualIp) {
      onConnect({
        ip: manualIp,
        port: parseInt(manualPort, 10),
        hostname: "Manual Connection",
      });
    }
  };

  const activeHosts = deduplicateHosts(hosts);
  const historyHosts = deduplicateHosts(knownHosts);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Search className="text-success" />
          Discover Hosts
        </h2>
        <button type="button" onClick={scan} disabled={scanning} className="btn btn-sm btn-outline">
          {scanning ? <span className="loading loading-spinner loading-xs"></span> : <RefreshCw />}
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-4" aria-live="polite" aria-busy={scanning}>
        {scanning && hosts.length === 0 ? (
          <div className="flex flex-col gap-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : activeHosts.length > 0 ? (
          activeHosts.map((host) => (
            <button
              type="button"
              key={`${host.ip}:${host.port}`}
              onClick={() => onConnect(host)}
              className="card bg-base-200 border border-base-300 hover:bg-base-300 transition-colors cursor-pointer w-full text-left"
            >
              <div className="card-body py-4 flex flex-row items-center justify-between">
                <div className="flex gap-4 items-center">
                  <div className="w-10 h-10 rounded-full bg-base-300 flex items-center justify-center">
                    <Globe className="text-success w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{getCleanHostname(host.hostname)}</p>
                    <p className="text-xs text-base-content/70 font-mono">
                      {host.ip}:{host.port}
                    </p>
                  </div>
                </div>
                <ChevronRight className="text-base-content/50" />
              </div>
            </button>
          ))
        ) : (
          <EmptyState
            icon={WifiOff}
            title="No Hosts Found"
            description="Check if the ShelfSync Host is running on the same network."
            actionLabel="Scan Again"
            onAction={scan}
          />
        )}
      </div>

      {historyHosts.length > 0 && !scanning && activeHosts.length === 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold text-base-content/70 uppercase">Previous Connections</h3>
          {historyHosts.map((host) => (
            <button
              type="button"
              key={`history-${host.ip}`}
              className="card card-side card-compact bg-base-100 border border-base-200 hover:bg-base-200 cursor-pointer p-2 items-center w-full text-left"
              onClick={() => onConnect(host)}
            >
              <div className="card-body px-4 py-3 w-full">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <p className="text-sm font-medium">{getCleanHostname(host.hostname)}</p>
                    <p className="text-[10px] text-base-content/50">{host.ip}</p>
                  </div>
                  <span className="badge badge-xs badge-ghost">History</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-base-300">
        <h3 className="text-xs font-bold text-base-content/70 mb-3 flex items-center gap-2 uppercase">
          <Plus className="w-4 h-4" />
          Manual Connection
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              placeholder="IP Address"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              className="input input-bordered flex-1 bg-base-200"
            />
            <input
              placeholder="Port"
              value={manualPort}
              onChange={(e) => setManualPort(e.target.value)}
              className="input input-bordered w-24 bg-base-200"
            />
            <button
              type="button"
              onClick={handleManualConnect}
              disabled={!manualIp}
              className="btn btn-success text-white"
            >
              Connect
            </button>
          </div>
          <p className="text-[10px] text-base-content/50 italic px-1">
            Tip: For Android Emulators, ensure the Host is bound to{" "}
            <code className="text-success font-bold">0.0.0.0</code> and connect to{" "}
            <code className="text-success font-bold">10.0.2.2</code>.
          </p>
        </div>
      </div>
    </div>
  );
};
