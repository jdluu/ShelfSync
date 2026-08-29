import { Book, Calendar, Download, User, X } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/Button";
import type { CategorizedLibraryRecord, PublicationLibraryInfo } from "@/types/offline";
import type { DownloadStatus, MediaType, Publication } from "@/types/opds";
import { getAcquisitionLinks } from "@/types/opds";
import { LibraryStateBadge } from "./LibraryStateBadge";

interface PublicationDetailModalProps {
  publication: Publication;
  onClose: () => void;
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
  onDeleteLocal?: (record: CategorizedLibraryRecord) => void;
}

function dateOrUnknown(date: string | null | undefined): string {
  if (!date) return "Unknown";
  try {
    return new Date(date).getFullYear().toString();
  } catch {
    return date;
  }
}

function cleanHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

export const PublicationDetailModal: React.FC<PublicationDetailModalProps> = ({
  publication,
  onClose,
  catalogUrl,
  transientUsername,
  transientPassword,
  contentRoot,
  onDownload,
  downloadStatus,
  downloadErrorMessage,
  libraryInfo,
}) => {
  const acquisitionLinks = getAcquisitionLinks(publication);

  const showDownload = catalogUrl && onDownload && acquisitionLinks.length > 0;

  const handleDownloadClick = async (format: string) => {
    if (!catalogUrl || !onDownload) return;
    await onDownload(
      {
        catalogUrl,
        transientUsername,
        transientPassword,
        contentRoot: contentRoot ?? "",
      },
      publication,
      format as MediaType,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${publication.title}`}
    >
      <div className="card bg-base-200 border-base-300 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="card-body p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-24 h-32 bg-base-300 rounded-lg shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                {publication.representative?.href ? (
                  <img
                    src={publication.representative.href}
                    alt={`Cover of ${publication.title}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Book className="w-10 h-10 text-base-content/30" aria-hidden="true" />
                )}
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <h2 className="font-display text-xl font-semibold leading-snug">
                  {publication.title}
                </h2>
                {(publication.authors?.length ?? 0) > 0 && (
                  <p className="flex items-center gap-1.5 text-sm text-base-content/70">
                    <User className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{(publication.authors ?? []).join(", ")}</span>
                  </p>
                )}
                {publication.publisher && (
                  <p className="text-xs text-base-content/50">{publication.publisher}</p>
                )}
                {publication.pubdate && (
                  <p className="flex items-center gap-1.5 text-xs text-base-content/50">
                    <Calendar className="w-3 h-3 shrink-0" aria-hidden="true" />
                    {dateOrUnknown(publication.pubdate)}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="btn-square shrink-0"
              aria-label="Close details"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Series info */}
          {publication.series && (
            <div className="badge badge-secondary badge-outline gap-1 mb-3">
              <span>{publication.series.name}</span>
              {publication.series.index != null && <span>#{publication.series.index}</span>}
            </div>
          )}

          {/* Categories */}
          {(publication.categories?.length ?? 0) > 0 && (
            <ul className="flex flex-wrap gap-1 mb-3 list-none p-0" aria-label="Categories">
              {(publication.categories ?? []).map((cat) => (
                <li key={cat} className="badge badge-xs badge-ghost">
                  {cat}
                </li>
              ))}
            </ul>
          )}

          {/* Languages */}
          {(publication.languages?.length ?? 0) > 0 && (
            <p className="text-xs text-base-content/50 mb-3">
              Language: {(publication.languages ?? []).join(", ")}
            </p>
          )}

          {/* Description */}
          {(publication.descriptions?.length ?? 0) > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-1">Synopsis</h3>
              <p className="text-sm text-base-content/70 leading-relaxed whitespace-pre-line">
                {publication.descriptions
                  .map((d) => cleanHtml(d))
                  .filter(Boolean)
                  .join("\n\n")}
              </p>
            </div>
          )}

          {/* Identifiers */}
          {Object.keys(publication.identifiers).length > 0 && (
            <div className="text-xs text-base-content/50 mb-4 space-y-0.5">
              {Object.entries(publication.identifiers).map(([scheme, value]) => (
                <p key={scheme}>
                  <span className="font-medium">{scheme}:</span> {value}
                </p>
              ))}
            </div>
          )}

          {/* Library state */}
          {libraryInfo?.primary && (
            <div className="mb-4" data-testid={`detail-library-state-${publication.id}`}>
              <LibraryStateBadge record={libraryInfo.primary} />
            </div>
          )}

          {/* Download section */}
          {showDownload && (
            <div className="flex flex-col gap-2 border-t border-base-300 pt-4">
              <h3 className="text-sm font-semibold mb-1">Download</h3>
              {downloadStatus === "failed" && downloadErrorMessage && (
                <p className="text-xs text-error" role="status">
                  {downloadErrorMessage}
                </p>
              )}
              {downloadStatus === "downloading" && (
                <p className="text-xs text-base-content/70">Downloading…</p>
              )}
              {downloadStatus !== "downloading" && (
                <div className="flex flex-wrap gap-2">
                  {acquisitionLinks.map((link) => {
                    const format = link.media_type ?? link.type ?? "application/epub+zip";
                    const label =
                      format === "application/epub+zip"
                        ? "EPUB"
                        : format === "application/pdf"
                          ? "PDF"
                          : format;
                    return (
                      <Button
                        key={`${link.href}-${format}`}
                        variant="primary"
                        size="sm"
                        onClick={() => handleDownloadClick(format)}
                        className="gap-2"
                        aria-label={`Download ${publication.title} as ${label}`}
                      >
                        <Download className="w-4 h-4" aria-hidden="true" />
                        {label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Close */}
          <div className="flex justify-end mt-4 pt-2 border-t border-base-300">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
