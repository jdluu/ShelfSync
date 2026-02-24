import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "@/services/apiClient";
import type { ConnectionInfo, Host } from "@/types/core";
import type { DiscoveryContextType } from "@/types/discovery";
import { isTauri, safeStoreLoad } from "@/utils/tauri";

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
      const store = await safeStoreLoad("shelfsync_settings.json");
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
    setActiveHosts([]); // Clear current hosts for visual feedback
    try {
      await api.network.refreshDiscovery();
      // Wait a moment for mDNS to re-resolve
      await new Promise((resolve) => setTimeout(resolve, 1500));
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
        const store = await safeStoreLoad("shelfsync_settings.json");
        const saved = await store.get<Host[]>("known_hosts");
        if (saved) setKnownHosts(saved);
      } catch (e) {
        console.error("Failed to load known hosts", e);
      }
    };
    loadInitial();

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen<Host[]>("discovery-update", (event) => {
          setActiveHosts(event.payload);
          updateKnownHosts(event.payload);
        }).then((u) => {
          unlisten = u;
        });
      });
    }

    return () => {
      if (unlisten) unlisten();
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
