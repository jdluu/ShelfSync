import { Book as BookIcon, Building2, Calendar, FileText, Globe, Star, Tag, X } from "lucide-react";
import type React from "react";
import type { Book } from "@/types/core";

interface BookDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book | null;
  coverUrl?: string;
  actionLabel?: string;
  actionColor?: string;
  onAction?: (book: Book) => void;
  onDelete?: (book: Book) => void;
  isDownloading?: boolean;
}

export const BookDetailsModal: React.FC<BookDetailsModalProps> = ({
  isOpen,
  onClose,
  book,
  coverUrl,
  actionLabel,
  actionColor = "primary",
  onAction,
  onDelete,
  isDownloading,
}) => {
  if (!isOpen || !book) return null;

  // Render format specific colors if present
  const getStatusColor = (status: string | null | undefined) => {
    if (status === "finished") return "badge-success";
    if (status === "reading") return "badge-info";
    return "badge-ghost";
  };

  /** Render star rating (Calibre stores 0-10, we display 0-5). */
  const renderStars = (rating: number) => {
    const stars = Math.round(rating / 2);
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={`star-${i.toString()}`}
            className={`w-3.5 h-3.5 ${i < stars ? "text-warning fill-warning" : "text-base-content/20"}`}
          />
        ))}
      </div>
    );
  };

  return (
    <dialog open={isOpen} className="modal modal-bottom sm:modal-middle bg-black/60 m-0 z-[1000]">
      <div className="modal-box p-0 overflow-hidden relative border border-base-content/10 w-full max-w-md sm:max-w-lg shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[85vh] flex flex-col rounded-none sm:rounded-2xl">
        {/* Fixed close button */}
        <button
          type="button"
          className="absolute top-4 right-4 btn btn-circle btn-sm bg-base-100/80 hover:bg-base-100 z-30 shadow-md border border-base-content/10"
          onClick={onClose}
          aria-label="Close modal"
        >
          <X className="w-5 h-5 text-base-content" />
        </button>

        {/* Scrollable Content Area — header scrolls with content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Header background with blurred cover */}
          <div className="h-36 w-full relative bg-base-300 overflow-hidden shrink-0">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover blur-xl opacity-40 scale-110"
                aria-hidden="true"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-base-100" />
          </div>

          <div className="px-5 pb-6 sm:px-6 relative -mt-20 flex flex-col items-center">
            {/* Cover Element */}
            <div className="w-28 h-40 bg-base-200 rounded-md shadow-2xl border border-base-content/10 overflow-hidden flex items-center justify-center flex-shrink-0 z-10">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={`Cover of ${book.title}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <BookIcon className="w-10 h-10 text-base-content/30" aria-hidden="true" />
              )}
            </div>

            <div className="mt-4 text-center w-full px-2">
              <h2
                className="text-2xl font-black leading-tight tracking-tight text-base-content"
                title={book.title}
              >
                {book.title}
              </h2>
              <p className="text-base text-base-content/70 mt-1 font-medium">{book.authors}</p>
            </div>

            {/* Rating */}
            {book.rating != null && book.rating > 0 && (
              <div className="mt-2">{renderStars(book.rating)}</div>
            )}

            {/* Description */}
            {book.description && (
              <p className="mt-3 text-sm text-base-content/70 leading-relaxed text-center px-2">
                {book.description}
              </p>
            )}

            <div className="mt-6 w-full flex flex-col text-sm bg-base-200/50 rounded-xl border border-base-content/5 overflow-hidden">
              {book.series && (
                <div className="flex justify-between items-center py-3 px-4 border-b border-base-content/5 last:border-0">
                  <span className="text-base-content/60 font-medium">Series</span>
                  <span className="font-bold text-base-content text-right text-xs">
                    {book.series}{" "}
                    <span className="text-base-content/50 font-normal">#{book.series_index}</span>
                  </span>
                </div>
              )}

              {book.publisher && (
                <div className="flex justify-between items-center py-3 px-4 border-b border-base-content/5 last:border-0">
                  <span className="text-base-content/60 font-medium flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> Publisher
                  </span>
                  <span className="text-xs text-base-content font-medium">{book.publisher}</span>
                </div>
              )}

              {book.published_date && (
                <div className="flex justify-between items-center py-3 px-4 border-b border-base-content/5 last:border-0">
                  <span className="text-base-content/60 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Published
                  </span>
                  <span className="text-xs text-base-content font-medium">
                    {new Date(book.published_date).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
              )}

              {book.language && (
                <div className="flex justify-between items-center py-3 px-4 border-b border-base-content/5 last:border-0">
                  <span className="text-base-content/60 font-medium flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" /> Language
                  </span>
                  <span className="text-xs text-base-content font-medium uppercase">
                    {book.language}
                  </span>
                </div>
              )}

              {book.formats && book.formats.length > 0 && (
                <div className="flex justify-between items-center py-3 px-4 border-b border-base-content/5 last:border-0">
                  <span className="text-base-content/60 font-medium flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Formats
                  </span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {book.formats.map((fmt) => (
                      <span
                        key={fmt}
                        className="badge badge-neutral badge-sm bg-base-300 text-base-content border-none font-bold text-[10px] tracking-wider uppercase"
                      >
                        {fmt}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {book.read_status && (
                <div className="flex justify-between items-center py-3 px-4 border-b border-base-content/5 last:border-0">
                  <span className="text-base-content/60 font-medium">Status</span>
                  <span className={`badge badge-sm font-bold ${getStatusColor(book.read_status)}`}>
                    {book.read_status}
                  </span>
                </div>
              )}

              {book.tags && book.tags.length > 0 && (
                <div className="flex flex-col gap-2 py-3 px-4 border-b border-base-content/5 last:border-0">
                  <span className="text-base-content/60 font-medium flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" /> Tags
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {book.tags.map((tag) => (
                      <span
                        key={tag}
                        className="badge badge-ghost badge-sm border-base-content/10 bg-base-100 text-[10px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {book.path && (
                <div className="flex flex-col gap-2 py-3 px-4 border-b border-base-content/5 last:border-0">
                  <span className="text-base-content/60 font-medium flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> File Path
                  </span>
                  <p className="text-[11px] font-mono text-base-content/80 break-all bg-base-100 p-2.5 rounded-lg border border-base-content/5 shadow-inner">
                    {book.path}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sticky Actions */}
        {(onAction || (onDelete && book.local_path)) && (
          <div className="sticky bottom-0 w-full p-4 bg-base-100 border-t border-base-content/5 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex flex-col gap-2">
            {onAction && actionLabel && (
              <button
                type="button"
                className={`btn w-full shadow-sm font-bold tracking-wide ${actionColor === "green" ? "btn-success text-white" : "btn-primary"}`}
                onClick={() => onAction(book)}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />
                    Syncing...
                  </>
                ) : (
                  actionLabel
                )}
              </button>
            )}

            {onDelete && (book.local_path || book.read_status) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm text-error font-bold flex items-center justify-center gap-2"
                onClick={() => {
                  if (
                    window.confirm(
                      `Are you sure you want to remove "${book.title}" from this device?`,
                    )
                  ) {
                    onDelete(book);
                  }
                }}
              >
                Delete from device
              </button>
            )}
          </div>
        )}
      </div>
      <form
        method="dialog"
        className="modal-backdrop"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Enter" && onClose()}
      >
        <button type="button" aria-label="Close metadata modal">
          close
        </button>
      </form>
    </dialog>
  );
};
