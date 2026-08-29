import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { offlineLibraryClient } from "@/services/offlineLibrary";
import type {
  CategorizedLibraryRecord,
  OfflineRefreshReport,
  PublicationLibraryInfo,
} from "@/types/offline";
import { buildPublicationLibraryInfo } from "@/types/offline";
import { notifyOpdsError } from "@/utils/notifyOpdsError";
import { isTauri } from "@/utils/tauri";

export interface UseOfflineLibraryStateParams {
  connected: boolean;
  catalogUrl: string;
  username: string;
  password: string;
}

/**
 * Offline-library view state for the catalog screen: the publication ->
 * library-info map, in-flight deletion tracking, and the refresh/delete
 * handlers backed by offlineLibraryClient.
 */
export function useOfflineLibraryState({
  connected,
  catalogUrl,
  username,
  password,
}: UseOfflineLibraryStateParams) {
  const [libraryInfoByPublicationId, setLibraryInfoByPublicationId] = useState<
    Record<string, PublicationLibraryInfo>
  >({});
  const [deletingRevisionId, setDeletingRevisionId] = useState<number | null>(null);

  const queryClient = useQueryClient();

  const refreshLibrarySnapshot = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const snapshot = await offlineLibraryClient.list();
      setLibraryInfoByPublicationId(buildPublicationLibraryInfo(snapshot));
    } catch {}
  }, []);

  useEffect(() => {
    if (connected) {
      void refreshLibrarySnapshot();
    }
  }, [connected, refreshLibrarySnapshot]);

  const handleDeleteLocal = useCallback(
    async (_publicationId: string, record: CategorizedLibraryRecord) => {
      if (deletingRevisionId !== null) return;
      setDeletingRevisionId(record.revision_id);
      try {
        await offlineLibraryClient.deleteContent(record.revision_id);
        await refreshLibrarySnapshot();
      } catch (error) {
        notifyOpdsError(error, {
          context: "Offline library",
          fallback: "Failed to delete the local copy",
        });
        // Keep the record visible on failure so the user can retry deletion.
      } finally {
        setDeletingRevisionId(null);
      }
    },
    [deletingRevisionId, refreshLibrarySnapshot],
  );

  const handleRefreshLibrary = useCallback(async (): Promise<OfflineRefreshReport | null> => {
    if (!isTauri()) return null;
    try {
      const report = await offlineLibraryClient.refresh({
        catalogUrl: catalogUrl.trim(),
        username,
        password,
      });
      await queryClient.invalidateQueries({ queryKey: ["opds", "catalog", catalogUrl] });
      await refreshLibrarySnapshot();
      return report;
    } catch (error) {
      notifyOpdsError(error, {
        context: "Catalog refresh",
        fallback: "Failed to refresh the offline library",
      });
      return null;
    }
  }, [catalogUrl, password, queryClient, refreshLibrarySnapshot, username]);

  return {
    libraryInfoByPublicationId,
    deletingRevisionId,
    refreshLibrarySnapshot,
    handleDeleteLocal,
    handleRefreshLibrary,
  };
}

export type UseOfflineLibraryStateResult = ReturnType<typeof useOfflineLibraryState>;
