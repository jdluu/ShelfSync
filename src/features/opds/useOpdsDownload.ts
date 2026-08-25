import { useCallback, useEffect, useRef, useState } from "react";
import { opdsClient } from "@/services/opdsClient";
import type { DownloadConfig, DownloadProgress, MediaType, Publication } from "@/types/opds";
import { isTauri, safeInvoke } from "@/utils/tauri";

export type DownloadStatus = "idle" | "downloading" | "completed" | "failed";

export interface UseOpdsDownloadResult {
  status: DownloadStatus;
  progress: DownloadProgress | null;
  localPath: string | null;
  mediaType: MediaType | null;
  error: string | null;
  startDownload: (
    config: DownloadConfig,
    publication: Publication,
    format: MediaType,
  ) => Promise<void>;
  cancelDownload: () => void;
}

export function useOpdsDownload() {
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanupRef = useRef<(() => void) | null>(null);
  const currentPublicationIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  const startDownload = useCallback(
    async (config: DownloadConfig, publication: Publication, format: MediaType) => {
      const isRunningInTauri = isTauri();

      setStatus("downloading");
      setLocalPath(null);
      setMediaType(null);
      setError(null);
      setProgress(null);

      currentPublicationIdRef.current = publication.id;

      if (isRunningInTauri) {
        const cleanup = opdsClient.onDownloadProgress(publication.id, (prog) => {
          setProgress(prog);

          if (prog.status === "completed") {
            setStatus("completed");
            setLocalPath(null);
          } else if (prog.status === "failed") {
            setStatus("failed");
            setError(prog.error ?? "Download failed");
          }
        });
        cleanupRef.current = cleanup;
      }

      try {
        const result = await opdsClient.downloadPublication(config, publication, format);
        setLocalPath(result.localPath);
        setMediaType(result.mediaType);
        setProgress({
          publicationId: publication.id,
          bytesReceived: 0,
          totalBytes: null,
          status: "completed",
        });
        setStatus("completed");
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        setError(errMsg);
        setProgress({
          publicationId: publication.id,
          bytesReceived: 0,
          totalBytes: null,
          status: "failed",
          error: errMsg,
        });
        setStatus("failed");
      }
    },
    [],
  );

  const cancelDownload = useCallback(() => {
    const publicationId = currentPublicationIdRef.current;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    currentPublicationIdRef.current = null;

    // Ask the backend to stop streaming the response. The UI resets to idle
    // immediately; a cancelled transfer reports no false completion.
    if (publicationId && isTauri()) {
      void safeInvoke<boolean>(
        "opds_cancel_download",
        { publication_id: publicationId },
        false,
      ).catch(() => {});
    }

    setStatus("idle");
    setProgress(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (status === "completed" || status === "failed" || status === "idle") {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    }
  }, [status]);

  return {
    status,
    progress,
    localPath,
    mediaType,
    error,
    startDownload,
    cancelDownload,
  };
}
