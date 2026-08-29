import type React from "react";
import { useOpdsCatalog } from "@/hooks/useOpdsCatalog";
import { OpdsCatalogScreen } from "./OpdsCatalogScreen";
import { PublicationDetailModal } from "./PublicationDetailModal";
import { SavedCatalogsManager } from "./SavedCatalogsManager";
import { useCatalogConnection } from "./useCatalogConnection";
import { useDownloadRegistry } from "./useDownloadRegistry";
import { useOfflineLibraryState } from "./useOfflineLibraryState";
import { useOpdsDownload } from "./useOpdsDownload";
import { useOpdsScreenOrchestration } from "./useOpdsScreenOrchestration";

const OpdsCatalogScreenContainer: React.FC = () => {
  const { status, error, localPath, mediaType, progress, startDownload } = useOpdsDownload();

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
  const orchestration = useOpdsScreenOrchestration({ connection, downloads });

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
        onDisconnect={orchestration.handleDisconnect}
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
        onViewDetails={orchestration.openDetail}
        onSaveCatalog={orchestration.handleSaveCatalog}
        savedCatalogs={
          <SavedCatalogsManager
            onConnectTo={connection.connectToSaved}
            refreshKey={orchestration.savedCatalogsKey}
          />
        }
      />
      {orchestration.detailPublication && (
        <PublicationDetailModal
          publication={orchestration.detailPublication}
          onClose={orchestration.closeDetail}
          catalogUrl={connection.url.trim()}
          transientUsername={connection.username}
          transientPassword={connection.password}
          contentRoot={connection.contentRoot}
          onDownload={downloads.handleDownload}
          downloadStatus={downloads.downloadStatuses[orchestration.detailPublication.id]}
          downloadErrorMessage={downloads.downloadErrors[orchestration.detailPublication.id]}
          libraryInfo={
            offline.libraryInfoByPublicationId[orchestration.detailPublication.id] ?? null
          }
        />
      )}
    </>
  );
};

export default OpdsCatalogScreenContainer;
