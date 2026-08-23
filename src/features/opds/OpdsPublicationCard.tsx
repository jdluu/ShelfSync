import { Book as BookIcon } from "lucide-react";
import type React from "react";
import { useMemo } from "react";
import type { Publication } from "@/types/opds";

interface OpdsPublicationCardProps {
  publication: Publication;
  showFormats?: boolean;
}

export const OpdsPublicationCard: React.FC<OpdsPublicationCardProps> = ({
  publication,
  showFormats = true,
}) => {
  const hasCover = publication.representative?.href;

  const formatLabels = useMemo(() => {
    if (!showFormats || !publication.links || publication.links.length === 0) return [];
    return publication.links
      .filter((link) => link.media_type)
      .map((link) => link.media_type as string);
  }, [publication.links, showFormats]);

  const getMediaTypeLabel = (mediaType: string): string => {
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
  };

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
                  e.currentTarget.style.display = "none";
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
        </div>

        {showFormats && formatLabels.length > 0 && (
          <ul className="flex flex-wrap gap-1 mt-1 list-none p-0" aria-label="Available formats">
            {formatLabels.map((fmt) => (
              <li key={fmt}>
                <span className="badge badge-xs badge-outline badge-info">
                  {getMediaTypeLabel(fmt)}
                </span>
              </li>
            ))}
          </ul>
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
