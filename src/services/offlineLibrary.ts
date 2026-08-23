import type {
  OfflineDeletedContent,
  OfflineDiskSpaceStatus,
  OfflineLibrarySnapshot,
  OfflineRefreshReport,
} from "@/types/offline";
import { isTauri, safeInvoke } from "@/utils/tauri";

export interface RefreshOfflineLibraryParams {
  catalogUrl: string;
  username: string;
  password: string;
  provider?: string;
}

export const offlineLibraryClient = {
  list: (): Promise<OfflineLibrarySnapshot> => {
    return safeInvoke<OfflineLibrarySnapshot>("list_offline_library");
  },

  refresh: (params: RefreshOfflineLibraryParams): Promise<OfflineRefreshReport> => {
    return safeInvoke<OfflineRefreshReport>("refresh_offline_library", {
      catalog_url: params.catalogUrl,
      username: params.username,
      password: params.password,
      provider: params.provider ?? undefined,
    });
  },

  deleteContent: (revisionId: number): Promise<OfflineDeletedContent> => {
    return safeInvoke<OfflineDeletedContent>("delete_offline_content", {
      revision_id: revisionId,
    });
  },

  checkDiskSpace: (requiredBytes: number): Promise<OfflineDiskSpaceStatus> => {
    return safeInvoke<OfflineDiskSpaceStatus>("check_download_space", {
      required_bytes: requiredBytes,
    });
  },
};

export function isTauriLibraryAvailable(): boolean {
  return isTauri();
}
