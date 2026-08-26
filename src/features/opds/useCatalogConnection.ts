import { useCallback, useState } from "react";
import type { SavedCatalog } from "@/services/savedCatalogs";
import type { OpdsConnectPayload } from "./OpdsCatalogScreen";
import { isValidOpdsCatalogUrl } from "./OpdsCatalogScreen";

const DEFAULT_CONTENT_ROOT = "ShelfSync";

export interface UseCatalogConnectionParams {
  /** Called after disconnect so consumers can clear per-feature caches (e.g. downloads). */
  onDisconnect?: () => void;
}

/**
 * Catalog connection state: credentials, connection flag, pagination, and
 * content root, plus the connect/disconnect/page handlers that govern them.
 */
export function useCatalogConnection({ onDisconnect }: UseCatalogConnectionParams = {}) {
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(false);
  const [page, setPage] = useState(1);
  const [contentRoot, setContentRoot] = useState(DEFAULT_CONTENT_ROOT);

  const connect = useCallback((payload: OpdsConnectPayload) => {
    if (!isValidOpdsCatalogUrl(payload.url)) return;
    setUrl(payload.url);
    setUsername(payload.username);
    setPassword(payload.password);
    setPage(1);
    setConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    setConnected(false);
    setUsername("");
    setPassword("");
    onDisconnect?.();
  }, [onDisconnect]);

  const changePage = useCallback((nextPage: number) => {
    setPage(() => Math.max(1, nextPage));
  }, []);

  const connectToSaved = useCallback((catalog: SavedCatalog) => {
    setUrl(catalog.url);
    setUsername(catalog.username);
    setPassword("");
    setPage(1);
    setConnected(true);
  }, []);

  return {
    url,
    setUrl,
    username,
    setUsername,
    password,
    setPassword,
    connected,
    page,
    contentRoot,
    setContentRoot,
    connect,
    disconnect,
    changePage,
    connectToSaved,
  };
}

export type UseCatalogConnectionResult = ReturnType<typeof useCatalogConnection>;
