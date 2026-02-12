import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "@/services/api";
import type { ConnectionInfo, Host } from "@/types/core";
import type { DiscoveryContextType } from "@/types/discovery";

const DiscoveryContext = createContext<DiscoveryContextType | undefined>(undefined);

export const DiscoveryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [myConnectionInfo, setMyConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [scanning, setScanning] = useState(false);
  const [knownHosts, setKnownHosts] = useState<Host[]>([]);
  const [activeHosts, setActiveHosts] = useState<Host[]>([]);

  const refreshConnectionInfo = useCallback(async () => {
    try {
      const info = await api.network.getConnectionInfo();
      setMyConnectionInfo(info);
    } catch (error) {
      console.error("Failed to get connection info:", error);
    }
  }, []);

  const updateKnownHosts = useCallback(async (newHosts: Host[]) => {
    try {
      const store = await load("shelfsync_settings.json");
      const current = (await store.get<Host[]>("known_hosts")) || [];
      const merged = [...current];

      let changed = false;
      for (const h of newHosts) {
        if (!merged.find((m) => m.ip === h.ip)) {
          merged.push(h);
          changed = true;
        }
      }

      if (changed) {
        setKnownHosts(merged);
        await store.set("known_hosts", merged);
        await store.save();
      }
    } catch (e) {
      console.error("Failed to update known hosts", e);
    }
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const results = await api.network.discoverHosts();
      setActiveHosts(results);
      updateKnownHosts(results);
    } catch (e) {
      console.error("Discovery error:", e);
    } finally {
      setScanning(false);
    }
  }, [updateKnownHosts]);

  useEffect(() => {
    refreshConnectionInfo();
    scan();

    const loadInitial = async () => {
      try {
        const store = await load("shelfsync_settings.json");
        const saved = await store.get<Host[]>("known_hosts");
        if (saved) setKnownHosts(saved);
      } catch (e) {
        console.error("Failed to load known hosts", e);
      }
    };
    loadInitial();

    const unlistenPromise = listen<Host[]>("discovery-update", (event) => {
      setActiveHosts(event.payload);
      updateKnownHosts(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [refreshConnectionInfo, scan, updateKnownHosts]);

  return (
    <DiscoveryContext.Provider
      value={{
        hosts: activeHosts,
        knownHosts,
        myConnectionInfo,
        scanning,
        scan,
        refreshConnectionInfo,
      }}
    >
      {children}
    </DiscoveryContext.Provider>
  );
};

export const useDiscovery = () => {
  const context = useContext(DiscoveryContext);
  if (context === undefined) {
    throw new Error("useDiscovery must be used within a DiscoveryProvider");
  }
  return context;
};
