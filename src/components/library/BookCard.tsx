import { Book as BookIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { Book, Host } from "@/types/core";

interface BookCardProps {
  book: Book;
  host?: Host | null;
  variant: "remote" | "local" | "host-view";
  onAction?: (book: Book) => void;
  onToggleStatus?: (book: Book) => void;
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
  variant,
  onAction,
  onToggleStatus,
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

  // Construct cover URL if we have a host
  const coverUrl = host ? `http://${host.ip}:${host.port}/api/cover/${book.id}` : undefined;

  const getStatusColor = (status: string | null | undefined) => {
    if (status === "finished") return "badge-success";
    if (status === "reading") return "badge-info";
    return "badge-ghost";
  };

  const isDownloading = syncStatus?.status === "downloading";

  if (compact) {
    return (
      <div
        className={`card bg-base-200 border transition-all duration-200 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          selected
            ? "border-primary bg-primary/10 shadow-md"
            : "border-base-300 hover:shadow-md hover:bg-base-300"
        } ${selectable ? "cursor-pointer" : ""}`}
        onClick={selectable ? onSelect : undefined}
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : undefined}
      >
        <div className="card-body p-3 flex flex-col items-center text-center gap-2">
          {selectable && (
            <div className="absolute top-2 right-2 z-10">
              <input
                type="checkbox"
                checked={selected}
                className="checkbox checkbox-primary checkbox-xs"
                readOnly
              />
            </div>
          )}
          <div className="w-full aspect-[2/3] bg-base-300 rounded-md overflow-hidden flex items-center justify-center relative shadow-sm max-w-[120px] mx-auto">
            {!imgError && coverUrl ? (
              <>
                {!imgLoaded && (
                  <div className="skeleton w-full h-full absolute inset-0 rounded-none bg-base-300" />
                )}
                <img
                  src={coverUrl}
                  alt={book.title}
                  className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                  onError={() => {
                    setImgError(true);
                    setImgLoaded(true);
                  }}
                  onLoad={() => setImgLoaded(true)}
                />
              </>
            ) : (
              <BookIcon className="w-8 h-8 text-base-content/50" />
            )}
            {isDownloading && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1">
                <progress
                  className="progress progress-primary w-full h-1"
                  value={(syncStatus?.progress || 0) * 100}
                  max="100"
                />
              </div>
            )}
          </div>
          <div className="flex flex-col w-full">
            <h3
              className="text-xs font-bold line-clamp-2 leading-tight min-h-[2.5em]"
              title={book.title}
            >
              {book.title}
            </h3>
            <p className="text-[10px] text-base-content/60 truncate" title={book.authors}>
              {book.authors}
            </p>
          </div>
          {onAction && variant === "remote" && (
            <button
              type="button"
              className="btn btn-xs btn-primary w-full"
              onClick={(e) => {
                e.stopPropagation();
                onAction(book);
              }}
              disabled={isDownloading}
            >
              {isDownloading ? "..." : actionLabel || "Sync"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: role is dynamically assigned
    <div
      className={`card bg-base-200 border transition-all duration-200 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 ${
        selected
          ? "border-primary bg-primary/10 shadow-md"
          : "border-base-300 hover:shadow-md hover:bg-base-300"
      } ${selectable ? "cursor-pointer" : ""}`}
      onClick={selectable ? onSelect : undefined}
      onKeyDown={(e) => {
        if (selectable && onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
    >
      <div className="card-body p-4 relative">
        {selectable && (
          <div className="absolute top-2 right-2 z-10">
            <input
              type="checkbox"
              checked={selected}
              className="checkbox checkbox-primary"
              readOnly
            />
          </div>
        )}
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="w-16 h-24 sm:w-20 sm:h-28 bg-base-300 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center relative shadow-sm">
            {!imgError && coverUrl ? (
              <>
                {!imgLoaded && (
                  <div className="skeleton w-full h-full absolute inset-0 rounded-none bg-base-300" />
                )}
                <img
                  src={coverUrl}
                  alt={`Cover of ${book.title}`}
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    imgLoaded ? "opacity-100" : "opacity-0"
                  }`}
                  onError={() => {
                    setImgError(true);
                    setImgLoaded(true);
                  }}
                  onLoad={() => setImgLoaded(true)}
                />
              </>
            ) : (
              <BookIcon className="w-8 h-8 text-base-content/50" aria-hidden="true" />
            )}

            {isDownloading && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1">
                <progress
                  className="progress progress-primary w-full h-1.5"
                  value={(syncStatus?.progress || 0) * 100}
                  max="100"
                ></progress>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 flex-1 overflow-hidden">
            <h3 className="text-sm font-bold truncate w-full" title={book.title}>
              {book.title}
            </h3>
            <p className="text-sm text-base-content/60 truncate w-full" title={book.authors}>
              {book.authors}
            </p>

            {book.series && (
              <p className="text-[10px] sm:text-xs font-bold text-accent -mt-0.5">
                {book.series} #{book.series_index}
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
                    className={`badge badge-xs sm:badge-sm cursor-pointer ${getStatusColor(book.read_status)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStatus(book);
                    }}
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

            {variant === "remote" && (
              <div className="w-full mt-2 flex gap-2">
                {onAction && (
                  <button
                    type="button"
                    className="btn btn-xs btn-primary flex-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction(book);
                    }}
                    disabled={isDownloading}
                  >
                    {isDownloading ? "Syncing..." : actionLabel || "Sync"}
                  </button>
                )}
              </div>
            )}

            {variant === "local" && onAction && actionLabel && (
              <button
                type="button"
                className={`btn btn-xs mt-2 w-full ${actionColor === "green" ? "btn-success text-white" : "btn-primary"}`}
                onClick={(e) => {
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
