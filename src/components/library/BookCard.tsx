import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { Book, Host } from "@/types/core";
import { isMobile } from "@/utils/tauri";
import { BookCover } from "./BookCover";
import { BookMetadata } from "./BookMetadata";

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

  // ... (rest of the component state)

  // Prioritize local cover if we are in local variant OR if we have a local path
  const isLocalImage =
    variant === "local" ||
    (book.cover_url && !book.cover_url.startsWith("http") && !book.cover_url.startsWith("/api/"));

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
      <article
        className={`card bg-base-100/80 backdrop-blur-sm border transition-all duration-300 overflow-hidden outline-none relative group ${
          selected
            ? "border-primary bg-primary/10 shadow-md ring-1 ring-primary"
            : "border-base-content/5 hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"
        }`}
        aria-labelledby={`book-title-${book.id}`}
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
          <BookCover
            book={book}
            coverUrl={coverUrl}
            imgError={imgError}
            imgLoaded={imgLoaded}
            isDownloading={isDownloading}
            syncProgress={syncStatus?.progress}
            handleImageError={handleImageError}
            handleImageLoad={handleImageLoad}
            onInfoClick={onInfoClick}
            compact={true}
          />
          <BookMetadata id={`book-title-${book.id}`} book={book} compact={true} />
        </div>
      </article>
    );
  }

  return (
    <article
      className={`card bg-base-100/80 backdrop-blur-sm border transition-all duration-300 overflow-hidden outline-none relative group ${
        selected
          ? "border-primary bg-primary/10 shadow-md ring-1 ring-primary ring-offset-1 ring-offset-base-100"
          : "border-base-content/5 hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"
      }`}
      aria-labelledby={`book-title-${book.id}`}
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
          <BookCover
            book={book}
            coverUrl={coverUrl}
            imgError={imgError}
            imgLoaded={imgLoaded}
            isDownloading={isDownloading}
            syncProgress={syncStatus?.progress}
            handleImageError={handleImageError}
            handleImageLoad={handleImageLoad}
            onInfoClick={onInfoClick}
            compact={false}
          />

          <div className="flex flex-col gap-1 flex-1 overflow-hidden mt-1 pr-10">
            <BookMetadata id={`book-title-${book.id}`} book={book} compact={false} />

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
                {book.formats.map((fmt: string) => (
                  <div key={fmt} className="badge badge-xs badge-outline badge-info">
                    {fmt.toUpperCase()}
                  </div>
                ))}
              </div>
            )}

            {(variant === "local" || variant === "remote") && onAction && actionLabel && (
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
    </article>
  );
};
