import { useCallback, useState } from "react";
import { savedCatalogsService } from "@/services/savedCatalogs";
import type { Publication } from "@/types/opds";
import { notifyOpdsError } from "@/utils/notifyOpdsError";
import type { UseCatalogConnectionResult } from "./useCatalogConnection";
import type { UseDownloadRegistryResult } from "./useDownloadRegistry";

export interface UseOpdsScreenOrchestrationParams {
  /** Catalog connection state; only the fields consumed here are used. */
  connection: Pick<UseCatalogConnectionResult, "url" | "username" | "disconnect">;
  /** Download registry; only the fields consumed here are used. */
  downloads: Pick<UseDownloadRegistryResult, "clearDownloads">;
}

/**
 * Screen-level orchestration for the OPDS catalog: the selected detail
 * publication, the saved-catalog refresh trigger, and the disconnect /
 * save-catalog callbacks that coordinate connection and download state.
 */
export function useOpdsScreenOrchestration({
  connection,
  downloads,
}: UseOpdsScreenOrchestrationParams) {
  const [detailPublication, setDetailPublication] = useState<Publication | null>(null);
  const [savedCatalogsKey, setSavedCatalogsKey] = useState(0);

  const handleDisconnect = useCallback(() => {
    connection.disconnect();
    downloads.clearDownloads();
  }, [connection.disconnect, downloads.clearDownloads]);

  const handleSaveCatalog = useCallback(async () => {
    try {
      await savedCatalogsService.save(
        connection.url.trim() || "Untitled catalog",
        connection.url,
        connection.username,
      );
      setSavedCatalogsKey((k) => k + 1);
    } catch (error) {
      // Non-fatal: saving the catalog is best-effort, but surface it.
      notifyOpdsError(error, {
        context: "Save catalog",
        fallback: "Failed to save the catalog",
      });
    }
  }, [connection]);

  const openDetail = useCallback((publication: Publication) => {
    setDetailPublication(publication);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailPublication(null);
  }, []);

  return {
    detailPublication,
    openDetail,
    closeDetail,
    savedCatalogsKey,
    handleDisconnect,
    handleSaveCatalog,
  };
}

export type UseOpdsScreenOrchestrationResult = ReturnType<typeof useOpdsScreenOrchestration>;
