import React, { useState, useEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { Search, Globe, ChevronRight, RefreshCw, Plus } from 'lucide-react';

interface Host {
  ip: string;
  port: number;
  hostname: string;
}

interface DiscoveryProps {
  onConnect: (host: Host) => void;
}

export const Discovery: React.FC<DiscoveryProps> = ({ onConnect }) => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [scanning, setScanning] = useState(false);
  const [manualIp, setManualIp] = useState("");
  const [manualPort, setManualPort] = useState("8080");

  const scan = async () => {
    setScanning(true);
    try {
      const results = await invoke<Host[]>("discover_hosts");
      setHosts(results);
    } catch (e) {
      console.error("Discovery error:", e);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    scan();
    const interval = setInterval(scan, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualConnect = () => {
    if (manualIp) {
      onConnect({
        ip: manualIp,
        port: parseInt(manualPort),
        hostname: "Manual Connection"
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
            <Search className="w-6 h-6 text-green-500" />
            Discover Hosts
        </h2>
        <button 
            onClick={scan}
            disabled={scanning}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
            <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            Refresh
        </button>
      </div>

      <div className="grid gap-4">
        {hosts.length > 0 ? (
            hosts.map((host) => (
                <button
                    key={`${host.ip}:${host.port}`}
                    onClick={() => onConnect(host)}
                    className="flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all group"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                            <Globe className="w-5 h-5 text-green-500" />
                        </div>
                        <div className="text-left">
                            <p className="font-semibold text-slate-100">{host.hostname}</p>
                            <p className="text-xs text-slate-500 font-mono">{host.ip}:{host.port}</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-green-500 transition-colors" />
                </button>
            ))
        ) : (
            <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
                <p className="text-slate-500">No hosts discovered yet.</p>
                <p className="text-xs text-slate-600 mt-1">Make sure your host is on the same network.</p>
            </div>
        )}
      </div>

      <div className="pt-4 border-t border-slate-800">
        <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Manual Connection
        </h3>
        <div className="flex gap-2">
            <input 
                type="text" 
                placeholder="IP Address (e.g. 192.168.1.5)" 
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500 transition-colors"
            />
            <input 
                type="text" 
                placeholder="Port" 
                value={manualPort}
                onChange={(e) => setManualPort(e.target.value)}
                className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500 transition-colors"
            />
            <button 
                onClick={handleManualConnect}
                disabled={!manualIp}
                className="px-6 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 rounded-lg font-medium transition-colors"
            >
                Connect
            </button>
        </div>
      </div>
    </div>
  );
};
