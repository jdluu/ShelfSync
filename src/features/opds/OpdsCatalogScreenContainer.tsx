import type React from "react";
import { useCallback, useState } from "react";
import { useOpdsCatalog } from "@/hooks/useOpdsCatalog";
import { savedCatalogsService } from "@/services/savedCatalogs";
import type { Publication } from "@/types/opds";
import { OpdsCatalogScreen } from "./OpdsCatalogScreen";
import { PublicationDetailModal } from "./PublicationDetailModal";
import { SavedCatalogsManager } from "./SavedCatalogsManager";
import { useCatalogConnection } from "./useCatalogConnection";
import { useDownloadRegistry } from "./useDownloadRegistry";
import { useOfflineLibraryState } from "./useOfflineLibraryState";
import { useOpdsDownload } from "./useOpdsDownload";

const OpdsCatalogScreenContainer: React.FC = () => {
  const { status, error, localPath, mediaType, progress, startDownload } = useOpdsDownload();

  const [detailPublication, setDetailPublication] = useState<Publication | null>(null);
  const [savedCatalogsKey, setSavedCatalogsKey] = useState(0);

  const connection = useCatalogConnection();
  const offline = useOfflineLibraryState({
    connected: connection.connected,
    catalogUrl: connection.url,
    username: connection.username,
    password: connection.password,
  });
  const downloads = useDownloadRegistry({
    status,
    error,
    localPath,
    mediaType,
    progress,
    startDownload,
    onSettled: offline.refreshLibrarySnapshot,
  });
  const catalogQuery = useOpdsCatalog(
    connection.url,
    connection.username,
    connection.password,
    connection.page,
    connection.connected,
  );

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
    } catch {
      // Non-fatal: saving the catalog is best-effort.
    }
  }, [connection]);

  return (
    <>
      <OpdsCatalogScreen
        url={connection.url}
        onUrlChange={connection.setUrl}
        username={connection.username}
        onUsernameChange={connection.setUsername}
        password={connection.password}
        onPasswordChange={connection.setPassword}
        connected={connection.connected}
        onConnect={connection.connect}
        onDisconnect={handleDisconnect}
        catalog={catalogQuery.data}
        loading={catalogQuery.isFetching}
        error={catalogQuery.error?.message ?? null}
        page={connection.page}
        onPageChange={connection.changePage}
        contentRoot={connection.contentRoot}
        onContentRootChange={connection.setContentRoot}
        downloadStatuses={downloads.downloadStatuses}
        downloadErrors={downloads.downloadErrors}
        downloadLocalPaths={downloads.downloadLocalPaths}
        downloadProgress={downloads.downloadProgressPercents}
        onDownload={downloads.handleDownload}
        libraryInfoByPublicationId={offline.libraryInfoByPublicationId}
        deletingRevisionId={offline.deletingRevisionId}
        onDeleteLocal={offline.handleDeleteLocal}
        onRefreshLibrary={offline.handleRefreshLibrary}
        onViewDetails={setDetailPublication}
        onSaveCatalog={handleSaveCatalog}
        savedCatalogs={
          <SavedCatalogsManager
            onConnectTo={connection.connectToSaved}
            refreshKey={savedCatalogsKey}
          />
        }
      />
      {detailPublication && (
        <PublicationDetailModal
          publication={detailPublication}
          onClose={() => setDetailPublication(null)}
          catalogUrl={connection.url.trim()}
          transientUsername={connection.username}
          transientPassword={connection.password}
          contentRoot={connection.contentRoot}
          onDownload={downloads.handleDownload}
          downloadStatus={downloads.downloadStatuses[detailPublication.id]}
          downloadErrorMessage={downloads.downloadErrors[detailPublication.id]}
          libraryInfo={offline.libraryInfoByPublicationId[detailPublication.id] ?? null}
        />
      )}
    </>
  );
};

export default OpdsCatalogScreenContainer;
