import { useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOpdsCatalog } from "@/hooks/useOpdsCatalog";
import { offlineLibraryClient } from "@/services/offlineLibrary";
import { type SavedCatalog, savedCatalogsService } from "@/services/savedCatalogs";
import type {
  CategorizedLibraryRecord,
  OfflineRefreshReport,
  PublicationLibraryInfo,
} from "@/types/offline";
import { buildPublicationLibraryInfo } from "@/types/offline";
import type {
  DownloadConfig,
  DownloadResult,
  DownloadStatus,
  MediaType,
  Publication,
} from "@/types/opds";
import { isTauri } from "@/utils/tauri";
import type { OpdsConnectPayload } from "./OpdsCatalogScreen";
import { isValidOpdsCatalogUrl, OpdsCatalogScreen } from "./OpdsCatalogScreen";
import { PublicationDetailModal } from "./PublicationDetailModal";
import { SavedCatalogsManager } from "./SavedCatalogsManager";
import { useOpdsDownload } from "./useOpdsDownload";

const DEFAULT_CONTENT_ROOT = "ShelfSync";

interface PendingDownloadResult {
  publicationId: string;
  format: MediaType;
  resolve: (result: DownloadResult) => void;
}

const OpdsCatalogScreenContainer: React.FC = () => {
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(false);
  const [page, setPage] = useState(1);
  const [contentRoot, setContentRoot] = useState(DEFAULT_CONTENT_ROOT);

  const [downloadStatuses, setDownloadStatuses] = useState<Record<string, DownloadStatus>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string | null>>({});
  const [downloadLocalPaths, setDownloadLocalPaths] = useState<Record<string, string | null>>({});
  const [downloadProgressPercents, setDownloadProgressPercents] = useState<
    Record<string, number | null>
  >({});

  const [libraryInfoByPublicationId, setLibraryInfoByPublicationId] = useState<
    Record<string, PublicationLibraryInfo>
  >({});
  const [deletingRevisionId, setDeletingRevisionId] = useState<number | null>(null);
  const [detailPublication, setDetailPublication] = useState<Publication | null>(null);
  const [savedCatalogsKey, setSavedCatalogsKey] = useState(0);

  const queryClient = useQueryClient();
  const catalogQuery = useOpdsCatalog(url, username, password, page, connected);
  const { status, error, localPath, mediaType, progress, startDownload } = useOpdsDownload();

  const activeDownloadIdRef = useRef<string | null>(null);
  const pendingResultRef = useRef<PendingDownloadResult | null>(null);

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

  useEffect(() => {
    const publicationId = activeDownloadIdRef.current;
    if (!publicationId) return;

    setDownloadStatuses((prev) => ({ ...prev, [publicationId]: status }));
    setDownloadErrors((prev) => ({ ...prev, [publicationId]: error }));
    setDownloadLocalPaths((prev) => ({ ...prev, [publicationId]: localPath }));

    if (status !== "completed" && status !== "failed") return;

    void refreshLibrarySnapshot();

    const pending = pendingResultRef.current;
    if (pending && pending.publicationId === publicationId) {
      pendingResultRef.current = null;
      activeDownloadIdRef.current = null;
      pending.resolve({
        localPath: status === "completed" ? (localPath ?? "") : "",
        mediaType: status === "completed" ? (mediaType ?? pending.format) : pending.format,
      });
    }
  }, [status, error, localPath, mediaType, refreshLibrarySnapshot]);

  useEffect(() => {
    const publicationId = activeDownloadIdRef.current;
    if (!publicationId || !progress) return;
    if (progress.publicationId !== publicationId) return;

    const { bytesReceived, totalBytes } = progress;
    const percent =
      totalBytes && totalBytes > 0
        ? Math.min(100, Math.max(0, Math.round((bytesReceived / totalBytes) * 100)))
        : null;

    setDownloadProgressPercents((prev) => ({ ...prev, [publicationId]: percent }));
  }, [progress]);

  const handleConnect = useCallback((payload: OpdsConnectPayload) => {
    if (!isValidOpdsCatalogUrl(payload.url)) return;
    setUrl(payload.url);
    setUsername(payload.username);
    setPassword(payload.password);
    setPage(1);
    setConnected(true);
  }, []);

  const handleDisconnect = useCallback(() => {
    setConnected(false);
    setUsername("");
    setPassword("");
    setDownloadStatuses({});
    setDownloadErrors({});
    setDownloadLocalPaths({});
    setDownloadProgressPercents({});
  }, []);

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(() => Math.max(1, nextPage));
  }, []);

  const handleDownload = useCallback(
    (
      config: DownloadConfig,
      publication: Publication,
      format: MediaType,
    ): Promise<DownloadResult> => {
      activeDownloadIdRef.current = publication.id;
      return new Promise<DownloadResult>((resolve) => {
        pendingResultRef.current = { publicationId: publication.id, format, resolve };
        void startDownload(config, publication, format);
      });
    },
    [startDownload],
  );

  const handleDeleteLocal = useCallback(
    async (_publicationId: string, record: CategorizedLibraryRecord) => {
      if (deletingRevisionId !== null) return;
      setDeletingRevisionId(record.revision_id);
      try {
        await offlineLibraryClient.deleteContent(record.revision_id);
        await refreshLibrarySnapshot();
      } catch {
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
        catalogUrl: url.trim(),
        username,
        password,
      });
      await queryClient.invalidateQueries({ queryKey: ["opds", "catalog", url] });
      await refreshLibrarySnapshot();
      return report;
    } catch {
      return null;
    }
  }, [password, queryClient, refreshLibrarySnapshot, url, username]);

  const handleViewDetails = useCallback((publication: Publication) => {
    setDetailPublication(publication);
  }, []);

  const handleSaveCatalog = useCallback(async () => {
    try {
      await savedCatalogsService.save(url.trim() || "Untitled catalog", url, username);
      setSavedCatalogsKey((k) => k + 1);
    } catch {
      // Non-fatal: saving the catalog is best-effort.
    }
  }, [url, username]);

  const handleConnectToSaved = useCallback((catalog: SavedCatalog) => {
    setUrl(catalog.url);
    setUsername(catalog.username);
    setPassword("");
    setPage(1);
    setConnected(true);
  }, []);

  return (
    <>
      <OpdsCatalogScreen
        url={url}
        onUrlChange={setUrl}
        username={username}
        onUsernameChange={setUsername}
        password={password}
        onPasswordChange={setPassword}
        connected={connected}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        catalog={catalogQuery.data}
        loading={catalogQuery.isFetching}
        error={catalogQuery.error?.message ?? null}
        page={page}
        onPageChange={handlePageChange}
        contentRoot={contentRoot}
        onContentRootChange={setContentRoot}
        downloadStatuses={downloadStatuses}
        downloadErrors={downloadErrors}
        downloadLocalPaths={downloadLocalPaths}
        downloadProgress={downloadProgressPercents}
        onDownload={handleDownload}
        libraryInfoByPublicationId={libraryInfoByPublicationId}
        deletingRevisionId={deletingRevisionId}
        onDeleteLocal={handleDeleteLocal}
        onRefreshLibrary={handleRefreshLibrary}
        onViewDetails={handleViewDetails}
        onSaveCatalog={handleSaveCatalog}
        savedCatalogs={
          <SavedCatalogsManager onConnectTo={handleConnectToSaved} refreshKey={savedCatalogsKey} />
        }
      />
      {detailPublication && (
        <PublicationDetailModal
          publication={detailPublication}
          onClose={() => setDetailPublication(null)}
          catalogUrl={url.trim()}
          transientUsername={username}
          transientPassword={password}
          contentRoot={contentRoot}
          onDownload={handleDownload}
          downloadStatus={downloadStatuses[detailPublication.id]}
          downloadErrorMessage={downloadErrors[detailPublication.id]}
          libraryInfo={libraryInfoByPublicationId[detailPublication.id] ?? null}
        />
      )}
    </>
  );
};

export default OpdsCatalogScreenContainer;
