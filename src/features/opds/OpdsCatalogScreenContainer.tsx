import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOpdsCatalog } from "@/hooks/useOpdsCatalog";
import type {
  DownloadConfig,
  DownloadResult,
  DownloadStatus,
  MediaType,
  Publication,
} from "@/types/opds";
import type { OpdsConnectPayload } from "./OpdsCatalogScreen";
import { isValidOpdsCatalogUrl, OpdsCatalogScreen } from "./OpdsCatalogScreen";
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

  const catalogQuery = useOpdsCatalog(url, username, password, page, connected);
  const { status, error, localPath, mediaType, progress, startDownload } = useOpdsDownload();

  const activeDownloadIdRef = useRef<string | null>(null);
  const pendingResultRef = useRef<PendingDownloadResult | null>(null);

  useEffect(() => {
    const publicationId = activeDownloadIdRef.current;
    if (!publicationId) return;

    setDownloadStatuses((prev) => ({ ...prev, [publicationId]: status }));
    setDownloadErrors((prev) => ({ ...prev, [publicationId]: error }));
    setDownloadLocalPaths((prev) => ({ ...prev, [publicationId]: localPath }));

    if (status !== "completed" && status !== "failed") return;

    const pending = pendingResultRef.current;
    if (pending && pending.publicationId === publicationId) {
      pendingResultRef.current = null;
      activeDownloadIdRef.current = null;
      pending.resolve({
        localPath: status === "completed" ? (localPath ?? "") : "",
        mediaType: status === "completed" ? (mediaType ?? pending.format) : pending.format,
      });
    }
  }, [status, error, localPath, mediaType]);

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

  return (
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
    />
  );
};

export default OpdsCatalogScreenContainer;
