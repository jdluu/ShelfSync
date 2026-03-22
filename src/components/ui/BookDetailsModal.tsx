import { FastAverageColor } from "fast-average-color";
import { Book as BookIcon, Building2, Calendar, FileText, Globe, Tag, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import type { Book } from "@/types/core";
import { StarRating } from "./StarRating";

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
  const [dominantColor, setDominantColor] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (isOpen && coverUrl) {
      const fac = new FastAverageColor();
      fac
        .getColorAsync(coverUrl, { algorithm: "dominant" })
        .then((color) => {
          if (isMounted) {
            setDominantColor(color.hex);
          }
        })
        .catch((e) => console.error("Failed to extract color", e));
    } else {
      setDominantColor(null);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, coverUrl]);

  const getStatusColor = (status: string | null | undefined) => {
    if (status === "finished") return "badge-success";
    if (status === "reading") return "badge-info";
    return "badge-ghost";
  };

  return (
    <AnimatePresence>
      {isOpen && book && (
        <m.div
          className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop click handler */}
          <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

          <m.div
            className="modal-box p-0 overflow-hidden border border-base-content/10 w-full max-w-md sm:max-w-lg shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[85vh] flex flex-col rounded-none sm:rounded-2xl relative z-10 m-0"
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Fixed close button */}
            <button
              type="button"
              className="absolute top-4 right-4 btn btn-circle btn-sm bg-base-100/80 hover:bg-base-100 z-30 shadow-md border border-base-content/10"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-base-content" />
            </button>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Header background with blurred cover */}
              <div
                className="h-36 w-full relative overflow-hidden shrink-0 transition-colors duration-700 ease-in-out bg-base-300"
                style={dominantColor ? { backgroundColor: dominantColor } : undefined}
              >
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
                {/* Cover Element with LayoutId */}
                <div className="w-28 h-40 bg-base-200 rounded-md shadow-2xl border border-base-content/10 flex items-center justify-center flex-shrink-0 z-10">
                  {coverUrl ? (
                    <m.img
                      layoutId={`book-cover-${book.id}`}
                      src={coverUrl}
                      alt={`Cover of ${book.title}`}
                      className="w-full h-full object-cover rounded-md"
                    />
                  ) : (
                    <m.div
                      layoutId={`book-cover-${book.id}`}
                      className="w-full h-full flex items-center justify-center rounded-md bg-base-200"
                    >
                      <BookIcon className="w-10 h-10 text-base-content/30" aria-hidden="true" />
                    </m.div>
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
                  <div className="mt-2">
                    <StarRating rating={book.rating} />
                  </div>
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
                        <span className="text-base-content/50 font-normal">
                          #{book.series_index}
                        </span>
                      </span>
                    </div>
                  )}

                  {book.publisher && (
                    <div className="flex justify-between items-center py-3 px-4 border-b border-base-content/5 last:border-0">
                      <span className="text-base-content/60 font-medium flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" /> Publisher
                      </span>
                      <span className="text-xs text-base-content font-medium">
                        {book.publisher}
                      </span>
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
                      <span
                        className={`badge badge-sm font-bold ${getStatusColor(book.read_status)}`}
                      >
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
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};
