import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DownloadConfig,
  DownloadProgress,
  DownloadResult,
  DownloadStatus,
  MediaType,
  Publication,
} from "@/types/opds";

interface PendingDownloadResult {
  publicationId: string;
  format: MediaType;
  resolve: (result: DownloadResult) => void;
}

export interface UseDownloadRegistryParams {
  /** Single-flight download channel (from useOpdsDownload). */
  status: DownloadStatus;
  error: string | null;
  localPath: string | null;
  mediaType: MediaType | null;
  progress: DownloadProgress | null;
  startDownload: (
    config: DownloadConfig,
    publication: Publication,
    format: MediaType,
  ) => Promise<void>;
  /** Invoked whenever a tracked download settles (completes or fails). */
  onSettled?: () => void | Promise<void>;
}

/**
 * Per-publication download state machine: mirrors the single-flight
 * useOpdsDownload channel into per-id status/error/path/progress maps and
 * hands each caller of handleDownload its own resolved DownloadResult.
 */
export function useDownloadRegistry({
  status,
  error,
  localPath,
  mediaType,
  progress,
  startDownload,
  onSettled,
}: UseDownloadRegistryParams) {
  const [downloadStatuses, setDownloadStatuses] = useState<Record<string, DownloadStatus>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string | null>>({});
  const [downloadLocalPaths, setDownloadLocalPaths] = useState<Record<string, string | null>>({});
  const [downloadProgressPercents, setDownloadProgressPercents] = useState<
    Record<string, number | null>
  >({});

  const activeDownloadIdRef = useRef<string | null>(null);
  const pendingResultRef = useRef<PendingDownloadResult | null>(null);

  useEffect(() => {
    const publicationId = activeDownloadIdRef.current;
    if (!publicationId) return;

    setDownloadStatuses((prev) => ({ ...prev, [publicationId]: status }));
    setDownloadErrors((prev) => ({ ...prev, [publicationId]: error }));
    setDownloadLocalPaths((prev) => ({ ...prev, [publicationId]: localPath }));

    if (status !== "completed" && status !== "failed") return;

    void onSettled?.();

    const pending = pendingResultRef.current;
    if (pending && pending.publicationId === publicationId) {
      pendingResultRef.current = null;
      activeDownloadIdRef.current = null;
      pending.resolve({
        localPath: status === "completed" ? (localPath ?? "") : "",
        mediaType: status === "completed" ? (mediaType ?? pending.format) : pending.format,
      });
    }
  }, [status, error, localPath, mediaType, onSettled]);

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

  const clearDownloads = useCallback(() => {
    setDownloadStatuses({});
    setDownloadErrors({});
    setDownloadLocalPaths({});
    setDownloadProgressPercents({});
  }, []);

  return {
    downloadStatuses,
    setDownloadStatuses,
    downloadErrors,
    setDownloadErrors,
    downloadLocalPaths,
    setDownloadLocalPaths,
    downloadProgressPercents,
    setDownloadProgressPercents,
    handleDownload,
    clearDownloads,
  };
}

export type UseDownloadRegistryResult = ReturnType<typeof useDownloadRegistry>;
