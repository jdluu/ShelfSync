import {
  AlertCircle as AlertCircleIcon,
  Book as BookIcon,
  ChevronDown as ChevronDownIcon,
  Download as DownloadIcon,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DownloadStatus, MediaType, Publication } from "@/types/opds";

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

function getMediaTypeLabel(mediaType: MediaType): string {
  const labels: Record<MediaType, string> = {
    "application/epub+zip": "EPUB",
    "application/pdf": "PDF",
  };
  return labels[mediaType] || mediaType;
}

export const OpdsPublicationCard: React.FC<OpdsPublicationCardProps> = ({
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
}) => {
  const hasCover = publication.representative?.href;
  const hasDownloadConfig = catalogUrl && contentRoot && onDownload;
  const hasAcquisitionLinks = publication.links?.some(
    (link) => link.media_type === "application/epub+zip" || link.media_type === "application/pdf",
  );

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
  const formatMenuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showFormatMenu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowFormatMenu(false);
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (
        formatMenuContainerRef.current &&
        event.target instanceof Node &&
        !formatMenuContainerRef.current.contains(event.target)
      ) {
        setShowFormatMenu(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showFormatMenu]);

  const formatLabels = useMemo(() => {
    if (!showFormats || !publication.links || publication.links.length === 0) return [];
    return publication.links
      .filter((link) => link.media_type)
      .map((link) => link.media_type as string);
  }, [publication.links, showFormats]);

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

  const showDownloadSection = hasDownloadConfig && hasAcquisitionLinks;
  const showAcquisitionTags = showFormats && formatLabels.length > 0 && !showDownloadSection;

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
          {downloadStatus !== "idle" && (
            <span className="sr-only">Download status: {downloadStatus}</span>
          )}
        </div>

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
            {downloadStatus === "failed" && downloadErrorMessage && (
              <p className="text-xs text-error" role="status" aria-live="polite">
                <AlertCircleIcon className="w-3 h-3 mr-1 inline" aria-hidden="true" />
                {downloadErrorMessage}
              </p>
            )}
            {downloadStatus === "downloading" && (
              <div className="flex flex-col gap-1">
                <progress
                  className="progress progress-primary w-full"
                  max={100}
                  value={typeof downloadProgress === "number" ? downloadProgress : undefined}
                  aria-label={`Downloading ${publication.title}`}
                />
                <p className="text-xs text-base-content/70">
                  {typeof downloadProgress === "number" ? `${downloadProgress}%` : "Downloading…"}
                </p>
              </div>
            )}
            <div ref={formatMenuContainerRef} className="relative inline-block w-full">
              <button
                type="button"
                onClick={() => setShowFormatMenu(!showFormatMenu)}
                disabled={downloadStatus === "downloading"}
                className={`btn btn-sm btn-outline w-full justify-between ${
                  downloadStatus === "downloading" ? "opacity-50 cursor-not-allowed" : ""
                }`}
                aria-haspopup="listbox"
                aria-expanded={showFormatMenu}
                aria-label={
                  selectedFormat
                    ? `Selected format: ${getMediaTypeLabel(selectedFormat)}, change format`
                    : "Select download format"
                }
              >
                <span>
                  {downloadStatus === "downloading"
                    ? "Downloading..."
                    : downloadLocalPath
                      ? "Downloaded"
                      : "Select Format"}
                </span>
                <ChevronDownIcon className="w-4 h-4" aria-hidden="true" />
              </button>
              {showFormatMenu && (
                <div className="absolute z-10 mt-1 w-full bg-base-100 border border-base-content/20 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {acquisitionFormats.map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => {
                        setSelectedFormat(format);
                        setShowFormatMenu(false);
                      }}
                      disabled={downloadStatus === "downloading"}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-base-200 ${
                        selectedFormat === format ? "bg-primary/10 font-medium" : ""
                      } ${downloadStatus === "downloading" ? "opacity-50 cursor-not-allowed" : ""}`}
                      role="option"
                      aria-selected={selectedFormat === format}
                    >
                      {getMediaTypeLabel(format)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {downloadLocalPath && downloadStatus === "completed" && (
              <p className="text-xs text-success" role="status">
                Downloaded: {downloadLocalPath.split("/").pop()}
              </p>
            )}

            {selectedFormat && downloadStatus === "idle" && (
              <button
                type="button"
                onClick={handleDownload}
                className="btn btn-sm btn-primary w-full"
                aria-label={`Download as ${getMediaTypeLabel(selectedFormat)}`}
              >
                <DownloadIcon className="w-4 h-4 mr-1" aria-hidden="true" />
                Download
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
