import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { Book as BookIcon } from "lucide-react";
import type React from "react";
import { useState, useMemo, useEffect } from "react";
import type { Book, Host } from "@/types/core";
import { isMobile } from "@/utils/tauri";

const IS_DEV = import.meta.env.DEV;

interface BookCardProps {
  book: Book;
  host?: Host | null;
  token?: string;
  variant: "remote" | "local" | "host-view";
  onAction?: (book: Book) => void;
  onToggleStatus?: (book: Book) => void;
  onInfoClick?: (book: Book, coverUrl?: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  syncStatus?: { progress: number; status: string };
  actionLabel?: string;
  actionColor?: string;
  compact?: boolean;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  host,
  token,
  variant,
  onAction,
  onToggleStatus,
  onInfoClick,
  selectable,
  selected,
  onSelect,
  syncStatus,
  actionLabel,
  actionColor = "blue",
  compact,
}) => {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Prioritize local cover if we are in local variant OR if we have a local path
  const isLocalImage = variant === "local" || (book.cover_url && !book.cover_url.startsWith("http") && !book.cover_url.startsWith("/api/"));

  const coverUrl = useMemo(() => {
    // If we have a blob fallback, use it
    if (blobUrl) return blobUrl;

    if (isLocalImage && book.cover_url) {
      return convertFileSrc(book.cover_url);
    }
    if (host) {
      return `http://${host.ip}:${host.port}/api/cover/${book.id}${token ? `?token=${token}` : ""}`;
    }
    return undefined;
  }, [book.id, book.cover_url, isLocalImage, host, token, blobUrl]);

  // Mobile Dev Fallback: If convertFileSrc is likely to fail due to PNA, use readFile
  useEffect(() => {
    let active = true;
    if (isLocalImage && book.cover_url && isMobile() && IS_DEV && !blobUrl) {
      console.log(`[BookCard] Attempting blob fallback for mobile dev: ${book.title}`);
      readFile(book.cover_url)
        .then((data) => {
          if (!active) return;
          const blob = new Blob([data], { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          console.log(`[BookCard] Generated blob fallback URL for "${book.title}"`);
          setBlobUrl(url);
          setImgError(false); // Reset error state to allow the new fallback image to render
        })
        .catch((err) => {
          if (!active) return;
          console.error(`[BookCard] Blob fallback failed for "${book.title}":`, err);
        });
    }
    return () => {
      active = false;
    };
  }, [isLocalImage, book.cover_url, book.title, blobUrl]);

  // Cleanup blob URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  const handleImageError = () => {
    setImgError(true);
    setImgLoaded(true);
  };

  const handleImageLoad = () => {
    setImgLoaded(true);
  };

  const getStatusColor = (status: string | null | undefined) => {
    if (status === "finished") return "badge-success";
    if (status === "reading") return "badge-info";
    return "badge-ghost";
  };

  const isDownloading = syncStatus?.status === "downloading";

  if (compact) {
    return (
      <div
        className={`card bg-base-100/80 backdrop-blur-sm border transition-all duration-300 overflow-hidden outline-none relative group ${
          selected
            ? "border-primary bg-primary/10 shadow-md ring-1 ring-primary"
            : "border-base-content/5 hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-base-200/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        {selectable && onSelect && (
          <button
            type="button"
            className="absolute inset-0 w-full h-full z-10 bg-transparent border-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect();
            }}
            aria-label={`Select ${book.title}`}
            aria-pressed={selected}
          />
        )}
        <div className="card-body p-3 flex flex-col items-center text-center gap-3 relative z-10">
          {selectable && (
            <div className="absolute top-2 right-2 z-20">
              <input
                type="checkbox"
                checked={selected}
                className="checkbox checkbox-primary checkbox-xs pointer-events-none"
                readOnly
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>
          )}
          <button
            type="button"
            className="w-full aspect-[2/3] bg-base-300/50 rounded-xl overflow-hidden flex items-center justify-center relative shadow-sm max-w-[120px] mx-auto outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer group/image ring-1 ring-base-content/5"
            onClick={(e) => {
              if (onInfoClick) {
                e.preventDefault();
                e.stopPropagation();
                onInfoClick(book, coverUrl);
              }
            }}
            aria-label={`View details for ${book.title}`}
          >
            {!imgError && coverUrl ? (
              <>
                {!imgLoaded && (
                  <div className="skeleton w-full h-full absolute inset-0 rounded-none bg-base-300/50" />
                )}
                <img
                  src={coverUrl}
                  alt={`Cover of ${book.title}`}
                  className={`w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-110 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                />
              </>
            ) : (
              <BookIcon className="w-8 h-8 text-base-content/30 group-hover/image:scale-110 group-hover/image:text-primary transition-all duration-300" />
            )}

            {/* Overlay Gradient for Image */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity duration-300" />

            {isDownloading && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1.5 backdrop-blur-sm">
                <progress
                  className="progress progress-primary w-full h-1.5"
                  value={(syncStatus?.progress || 0) * 100}
                  max="100"
                />
              </div>
            )}
          </button>
          <div className="flex flex-col w-full px-1 z-10">
            <h3
              className="text-xs font-bold line-clamp-2 leading-tight min-h-[2.5em] tracking-tight"
              title={book.title}
            >
              {book.title}
            </h3>
            <p
              className="text-[10px] text-base-content/60 truncate font-medium mt-0.5"
              title={book.authors}
            >
              {book.authors}
            </p>
            {book.series && (
              <p className="text-[9px] font-bold text-accent mt-0.5 truncate" title={`${book.series}${book.series_index ? ` #${book.series_index}` : ""}`}>
                {book.series}{book.series_index ? ` #${book.series_index}` : ""}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card bg-base-100/80 backdrop-blur-sm border transition-all duration-300 overflow-hidden outline-none relative group ${
        selected
          ? "border-primary bg-primary/10 shadow-md ring-1 ring-primary ring-offset-1 ring-offset-base-100"
          : "border-base-content/5 hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-base-200/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      {selectable && onSelect && (
        <button
          type="button"
          className="absolute inset-0 w-full h-full z-10 bg-transparent border-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect();
          }}
          aria-label={`Select ${book.title}`}
          aria-pressed={selected}
        />
      )}
      <div className="card-body p-4 relative z-10">
        {selectable && (
          <div className="absolute top-2 right-2 z-20">
            <input
              type="checkbox"
              checked={selected}
              className="checkbox checkbox-primary pointer-events-none"
              readOnly
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
        )}
        <div className="flex items-start gap-3 sm:gap-4">
          <button
            type="button"
            className="w-16 h-24 sm:w-20 sm:h-28 bg-base-300/50 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center relative shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer group/image ring-1 ring-base-content/5"
            onClick={(e) => {
              if (onInfoClick) {
                e.preventDefault();
                e.stopPropagation();
                onInfoClick(book, coverUrl);
              }
            }}
            aria-label={`View details for ${book.title}`}
          >
            {!imgError && coverUrl ? (
              <>
                {!imgLoaded && (
                  <div className="skeleton w-full h-full absolute inset-0 rounded-none bg-base-300/50" />
                )}
                <img
                  src={coverUrl}
                  alt={`Cover of ${book.title}`}
                  className={`w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-110 ${
                    imgLoaded ? "opacity-100" : "opacity-0"
                  }`}
                  onError={handleImageError}
                  onLoad={handleImageLoad}
                />
              </>
            ) : (
              <BookIcon
                className="w-8 h-8 text-base-content/30 group-hover/image:scale-110 group-hover/image:text-primary transition-all duration-300"
                aria-hidden="true"
              />
            )}

            {/* Overlay Gradient for Image */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity duration-300" />

            {isDownloading && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1.5 backdrop-blur-sm">
                <progress
                  className="progress progress-primary w-full h-1.5"
                  value={(syncStatus?.progress || 0) * 100}
                  max="100"
                ></progress>
              </div>
            )}
          </button>

          <div className="flex flex-col gap-1 flex-1 overflow-hidden mt-1 pr-10">
            <h3 className="text-sm font-bold truncate w-full" title={book.title}>
              {book.title}
            </h3>
            <p className="text-sm text-base-content/70 truncate w-full" title={book.authors}>
              {book.authors}
            </p>

            {book.series && (
              <p className="text-[10px] sm:text-xs font-bold text-accent -mt-0.5 max-w-full truncate">
                {book.series}{book.series_index ? ` #${book.series_index}` : ""}
              </p>
            )}

            {book.tags && book.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {book.tags.slice(0, 3).map((tag) => (
                  <div key={tag} className="badge badge-xs badge-ghost text-[9px]">
                    {tag}
                  </div>
                ))}
                {book.tags.length > 3 && (
                  <span className="text-[10px] text-base-content/50">+{book.tags.length - 3}</span>
                )}
              </div>
            )}

            {variant === "host-view" && (
              <p className="text-[10px] sm:text-xs text-base-content/50 font-mono break-all line-clamp-2">
                {book.path}
              </p>
            )}

            {variant === "local" && (
              <div className="flex flex-wrap gap-1 mt-1">
                <div className="badge badge-xs sm:badge-sm badge-ghost">Downloaded</div>
                {onToggleStatus && (
                  <button
                    type="button"
                    className={`badge badge-xs sm:badge-sm cursor-pointer relative z-20 ${getStatusColor(book.read_status)}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleStatus(book);
                    }}
                    aria-label={`Mark ${book.title} as ${book.read_status === "finished" ? "unread" : book.read_status === "reading" ? "finished" : "reading"}`}
                  >
                    {book.read_status || "unread"}
                  </button>
                )}
              </div>
            )}

            {variant === "remote" && book.formats && (
              <div className="flex flex-wrap gap-1 mt-1">
                {book.formats.map((fmt) => (
                  <div key={fmt} className="badge badge-xs badge-outline badge-info">
                    {fmt.toUpperCase()}
                  </div>
                ))}
              </div>
            )}

            {variant === "local" && onAction && actionLabel && (
              <button
                type="button"
                className={`btn btn-xs mt-2 w-full relative z-20 ${actionColor === "green" ? "btn-success text-white" : "btn-primary"}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAction(book);
                }}
              >
                {actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
