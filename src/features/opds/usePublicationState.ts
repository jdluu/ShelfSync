import { useMemo, useState } from "react";
import type { CategorizedLibraryRecord, PublicationLibraryInfo } from "@/types/offline";
import type {
  DownloadConfig,
  DownloadResult,
  DownloadStatus,
  MediaType,
  Publication,
} from "@/types/opds";

export interface UsePublicationStateParams {
  publication: Publication;
  showFormats?: boolean;
  catalogUrl?: string;
  transientUsername?: string;
  transientPassword?: string;
  contentRoot?: string;
  onDownload?: (
    config: DownloadConfig,
    publication: Publication,
    format: MediaType,
  ) => Promise<DownloadResult>;
  downloadStatus?: DownloadStatus;
  downloadProgress?: number | null;
  downloadLocalPath?: string | null;
  downloadErrorMessage?: string | null;
  libraryInfo?: PublicationLibraryInfo | null;
}

export function usePublicationState({
  publication,
  showFormats = true,
  catalogUrl,
  transientUsername,
  transientPassword,
  contentRoot,
  onDownload,
  downloadStatus = "idle",
  downloadProgress = null,
  downloadLocalPath = null,
  downloadErrorMessage = null,
  libraryInfo = null,
}: UsePublicationStateParams) {
  const hasDownloadConfig = catalogUrl && contentRoot && onDownload;
  const hasAcquisitionLinks = publication.links?.some(
    (link) => link.media_type === "application/epub+zip" || link.media_type === "application/pdf",
  );

  const primaryRecord = libraryInfo?.primary ?? null;
  const supersededRecords = libraryInfo?.superseded ?? [];
  const fallbackSuperseded = primaryRecord === null ? (supersededRecords[0] ?? null) : null;
  const isBusyDownloading =
    downloadStatus === "downloading" || primaryRecord?.section === "downloading";

  const acquisitionFormats: MediaType[] = useMemo(() => {
    const formats: MediaType[] = [];
    if (!publication.links) return formats;
    for (const link of publication.links) {
      if (link.media_type === "application/epub+zip" || link.media_type === "application/pdf") {
        formats.push(link.media_type as MediaType);
      }
    }
    return formats;
  }, [publication.links]);

  const [selectedFormat, setSelectedFormat] = useState<MediaType | null>(null);
  const [showFormatMenu, setShowFormatMenu] = useState(false);

  const formatLabels = useMemo(() => {
    if (!showFormats || !publication.links || publication.links.length === 0) return [];
    return publication.links
      .filter((link) => link.media_type)
      .map((link) => link.media_type as string);
  }, [publication.links, showFormats]);

  const selectFormat = (format: MediaType) => {
    setSelectedFormat(format);
  };

  const closeFormatMenu = () => {
    setShowFormatMenu(false);
  };

  const handleDownload = async () => {
    if (!selectedFormat || !hasDownloadConfig || !onDownload) return;
    try {
      await onDownload(
        {
          catalogUrl,
          transientUsername,
          transientPassword,
          contentRoot,
        },
        publication,
        selectedFormat,
      );
    } catch {}
  };

  const retryableRecord =
    primaryRecord?.section === "failed" &&
    (primaryRecord.media_type === "application/epub+zip" ||
      primaryRecord.media_type === "application/pdf")
      ? primaryRecord
      : null;

  const handleRetry = async () => {
    if (!retryableRecord || !hasDownloadConfig || !onDownload) return;
    setSelectedFormat(retryableRecord.media_type as MediaType);
    setShowFormatMenu(false);
    try {
      await onDownload(
        { catalogUrl, transientUsername, transientPassword, contentRoot },
        publication,
        retryableRecord.media_type as MediaType,
      );
    } catch {}
  };

  const cancelDownload = () => {
    setShowFormatMenu(false);
    setSelectedFormat(null);
  };

  const deletableRecords: CategorizedLibraryRecord[] = [];
  if (primaryRecord?.local_relative_path && primaryRecord.section !== "downloading") {
    deletableRecords.push(primaryRecord);
  }
  for (const record of supersededRecords) {
    if (record.local_relative_path) {
      deletableRecords.push(record);
    }
  }

  const showDownloadSection = hasDownloadConfig && hasAcquisitionLinks;
  const showAcquisitionTags = showFormats && formatLabels.length > 0 && !showDownloadSection;

  return {
    downloadStatus,
    downloadProgress,
    downloadLocalPath,
    downloadErrorMessage,
    hasDownloadConfig,
    hasAcquisitionLinks,
    primaryRecord,
    supersededRecords,
    fallbackSuperseded,
    isBusyDownloading,
    acquisitionFormats,
    formatLabels,
    selectedFormat,
    showFormatMenu,
    setShowFormatMenu,
    selectFormat,
    closeFormatMenu,
    handleDownload,
    handleRetry,
    cancelDownload,
    retryableRecord,
    deletableRecords,
    showDownloadSection,
    showAcquisitionTags,
  };
}

export type UsePublicationStateResult = ReturnType<typeof usePublicationState>;
