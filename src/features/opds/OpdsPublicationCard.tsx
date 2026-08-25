import {
  AlertCircle as AlertCircleIcon,
  Book as BookIcon,
  Download as DownloadIcon,
  RotateCcw as RetryIcon,
  Trash2 as TrashIcon,
} from "lucide-react";
import type React from "react";
import type { CategorizedLibraryRecord, PublicationLibraryInfo } from "@/types/offline";
import type { DownloadStatus, MediaType, Publication } from "@/types/opds";
import { LibraryStateBadge } from "./LibraryStateBadge";
import { getMediaTypeLabel, PublicationFormatMenu } from "./PublicationFormatMenu";
import { usePublicationState } from "./usePublicationState";

interface OpdsPublicationCardProps {
  publication: Publication;
  showFormats?: boolean;
  catalogUrl?: string;
  transientUsername?: string;
  transientPassword?: string;
  contentRoot?: string;
  onDownload?: (
    config: {
      catalogUrl: string;
      transientUsername?: string;
      transientPassword?: string;
      contentRoot: string;
    },
    publication: Publication,
    format: MediaType,
  ) => Promise<{ localPath: string; mediaType: MediaType }>;
  downloadStatus?: DownloadStatus;
  downloadProgress?: number | null;
  downloadLocalPath?: string | null;
  downloadErrorMessage?: string | null;
  libraryInfo?: PublicationLibraryInfo | null;
  deletingRevisionId?: number | null;
  onDeleteLocal?: (record: CategorizedLibraryRecord) => void;
}

function getMediaTypeLabelForBadge(mediaType: string): string {
  const labels: Record<string, string> = {
    "application/epub+zip": "EPUB",
    "application/pdf": "PDF",
    "application/pdf+aes": "PDF (Encrypted)",
    "application/zip": "ZIP",
    "chemical/x-mdldrum": "MDL",
    "chemical/x-mol": "MOL",
    "text/html": "HTML",
    "application/rtf": "RTF",
    "application/x-mobipocket-ebook": "MOBI",
    "application/x-kindle": "Kindle",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
  };
  return labels[mediaType.toLowerCase()] || mediaType;
}

export const OpdsPublicationCard: React.FC<OpdsPublicationCardProps> = ({
  publication,
  showFormats = true,
  catalogUrl,
  transientUsername,
  transientPassword,
  contentRoot,
  onDownload,
  downloadStatus,
  downloadProgress,
  downloadLocalPath,
  downloadErrorMessage,
  libraryInfo,
  deletingRevisionId = null,
  onDeleteLocal,
}) => {
  const hasCover = publication.representative?.href;

  const {
    downloadStatus: status,
    downloadProgress: progress,
    downloadLocalPath: localPath,
    downloadErrorMessage: errorMessage,
    primaryRecord,
    fallbackSuperseded,
    isBusyDownloading,
    acquisitionFormats,
    formatLabels,
    selectedFormat,
    showFormatMenu,
    setShowFormatMenu,
    selectFormat,
    handleDownload,
    handleRetry,
    retryableRecord,
    deletableRecords,
    showDownloadSection,
    showAcquisitionTags,
  } = usePublicationState({
    publication,
    showFormats,
    catalogUrl,
    transientUsername,
    transientPassword,
    contentRoot,
    onDownload,
    downloadStatus,
    downloadProgress,
    downloadLocalPath,
    downloadErrorMessage,
    libraryInfo,
  });

  return (
    <article
      className="card bg-base-100/80 backdrop-blur-sm border border-base-content/10 hover:shadow-md transition-shadow duration-200"
      aria-labelledby={`pub-title-${publication.id}`}
    >
      <div className="card-body p-4 flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <div className="w-12 h-16 bg-base-300/50 rounded-xl flex items-center justify-center flex-shrink-0">
            {hasCover ? (
              <img
                src={publication.representative?.href}
                alt={`Cover of ${publication.title}`}
                className="w-full h-full object-cover rounded-xl"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <BookIcon className="w-6 h-6 text-base-content/40" aria-hidden="true" />
            )}
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <h3
              id={`pub-title-${publication.id}`}
              className="text-sm font-bold text-base-content leading-tight truncate"
              title={publication.title}
            >
              {publication.title}
            </h3>
            {publication.authors && publication.authors.length > 0 && (
              <p
                className="text-xs text-base-content/60 truncate"
                title={publication.authors.join(", ")}
              >
                {publication.authors.join(", ")}
              </p>
            )}
            {publication.series && (
              <p
                className="text-[10px] text-accent truncate"
                title={`${publication.series.name}${publication.series.index ? ` #${publication.series.index}` : ""}`}
              >
                {publication.series.name}
                {publication.series.index ? ` #${publication.series.index}` : ""}
              </p>
            )}
          </div>
          {status !== "idle" && <span className="sr-only">Download status: {status}</span>}
        </div>

        {(primaryRecord || fallbackSuperseded) && (
          <div
            className="flex flex-wrap items-center gap-1"
            data-testid={`library-state-${publication.id}`}
          >
            {primaryRecord && <LibraryStateBadge record={primaryRecord} />}
            {fallbackSuperseded && !primaryRecord && (
              <LibraryStateBadge record={fallbackSuperseded} />
            )}
            {primaryRecord?.section === "unavailable" &&
              primaryRecord.local_relative_path && (
                <span className="text-[10px] text-base-content/60">
                  local copy kept on device
                </span>
              )}
          </div>
        )}

        {showAcquisitionTags && (
          <ul className="flex flex-wrap gap-1 mt-1 list-none p-0" aria-label="Available formats">
            {formatLabels.map((fmt) => (
              <li key={fmt}>
                <span className="badge badge-xs badge-outline badge-info">
                  {getMediaTypeLabelForBadge(fmt)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {showDownloadSection && acquisitionFormats.length > 0 && (
          <section className="flex flex-col gap-2 mt-2" aria-label="Download options">
            {status === "failed" && errorMessage && (
              <p className="text-xs text-error" role="status" aria-live="polite">
                <AlertCircleIcon className="w-3 h-3 mr-1 inline" aria-hidden="true" />
                {errorMessage}
              </p>
            )}
            {status === "downloading" && (
              <div className="flex flex-col gap-1">
                <progress
                  className="progress progress-primary w-full"
                  max={100}
                  value={typeof progress === "number" ? progress : undefined}
                  aria-label={`Downloading ${publication.title}`}
                />
                <p className="text-xs text-base-content/70">
                  {typeof progress === "number" ? `${progress}%` : "Downloading…"}
                </p>
              </div>
            )}
            <PublicationFormatMenu
              isOpen={showFormatMenu}
              onOpenChange={setShowFormatMenu}
              formats={acquisitionFormats}
              selectedFormat={selectedFormat}
              onSelectFormat={selectFormat}
              disabled={status === "downloading"}
              triggerText={
                status === "downloading"
                  ? "Downloading..."
                  : localPath
                    ? "Downloaded"
                    : "Select Format"
              }
              triggerAriaLabel={
                status === "downloading"
                  ? `Downloading ${publication.title}${
                      typeof progress === "number" ? ` ${progress}%` : ""
                    }`
                  : undefined
              }
            />

            {localPath && status === "completed" && (
              <p className="text-xs text-success" role="status">
                Downloaded: {localPath.split("/").pop()}
              </p>
            )}

            {selectedFormat && status === "idle" && (
              <button
                type="button"
                onClick={handleDownload}
                className="btn btn-sm btn-primary w-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Download ${publication.title} as ${getMediaTypeLabel(selectedFormat)}`}
              >
                <DownloadIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                Download
              </button>
            )}
          </section>
        )}

        {(primaryRecord?.section === "failed" ||
          retryableRecord !== null ||
          deletableRecords.length > 0) && (
          <section
            className="flex flex-col gap-1 mt-1"
            aria-label="Offline library actions"
          >
            {primaryRecord?.section === "failed" && primaryRecord.job_error && (
              <p className="text-xs text-error" role="status">
                <AlertCircleIcon className="w-3 h-3 mr-1 inline" aria-hidden="true" />
                {primaryRecord.job_error}
              </p>
            )}
            {deletableRecords.map((record) => (
              <button
                key={record.revision_id}
                type="button"
                onClick={() => onDeleteLocal?.(record)}
                disabled={deletingRevisionId === record.revision_id}
                className="btn btn-sm btn-ghost text-error justify-start gap-2 px-2 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={
                  record.section === "superseded"
                    ? `Delete older ${getMediaTypeLabelForBadge(record.media_type)} copy of ${publication.title}`
                    : `Delete local copy of ${publication.title}`
                }
              >
                <TrashIcon className="w-3.5 h-3.5" aria-hidden="true" />
                {deletingRevisionId === record.revision_id
                  ? "Deleting..."
                  : record.section === "superseded"
                    ? `Delete older ${getMediaTypeLabelForBadge(record.media_type)} copy`
                    : "Delete local copy"}
              </button>
            ))}
            {retryableRecord && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isBusyDownloading}
                className="btn btn-sm btn-outline btn-error w-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Retry download of ${publication.title}`}
              >
                <RetryIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                Retry download
              </button>
            )}
          </section>
        )}

        {publication.descriptions && publication.descriptions.length > 0 && (
          <p
            className="text-xs text-base-content/50 line-clamp-2 mt-1"
            title={publication.descriptions.join(" ")}
          >
            {publication.descriptions.join(" ")}
          </p>
        )}
      </div>
    </article>
  );
};
