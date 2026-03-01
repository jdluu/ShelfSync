import { Book as BookIcon, FileText, Tag, X } from "lucide-react";
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
  isDownloading,
}) => {
  if (!isOpen || !book) return null;

  // Render format specific colors if present
  const getStatusColor = (status: string | null | undefined) => {
    if (status === "finished") return "badge-success";
    if (status === "reading") return "badge-info";
    return "badge-ghost";
  };

  return (
    <dialog open={isOpen} className="modal modal-bottom sm:modal-middle bg-black/60 m-0 z-[1000]">
      <div className="modal-box p-0 overflow-hidden relative border border-base-300 max-w-sm sm:max-w-md w-full">
        {/* Header background with blurred cover */}
        <div className="h-32 w-full relative bg-base-300 overflow-hidden flex items-center justify-center">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover blur-md opacity-50 scale-110"
              aria-hidden="true"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-base-100 to-transparent" />

          <button
            type="button"
            className="absolute top-3 right-3 btn btn-circle btn-sm btn-ghost bg-base-100/30 hover:bg-base-100/70 z-10"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="px-6 pb-6 relative -mt-16 flex flex-col items-center">
          {/* Cover Element */}
          <div className="w-24 h-36 bg-base-200 rounded-md shadow-lg border border-base-300 overflow-hidden flex items-center justify-center flex-shrink-0 z-10">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={`Cover of ${book.title}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <BookIcon className="w-8 h-8 text-base-content/50" aria-hidden="true" />
            )}
          </div>

          <div className="mt-4 text-center w-full">
            <h2 className="text-xl font-bold leading-tight" title={book.title}>
              {book.title}
            </h2>
            <p className="text-sm text-base-content/70 mt-1">{book.authors}</p>
          </div>

          <div className="mt-4 w-full flex flex-col gap-3 text-sm">
            {book.series && (
              <div className="flex justify-between items-center py-2 border-b border-base-200">
                <span className="text-base-content/60 font-medium">Series</span>
                <span className="font-bold text-accent text-right">
                  {book.series}{" "}
                  <span className="text-base-content/50 font-normal">#{book.series_index}</span>
                </span>
              </div>
            )}

            {book.formats && book.formats.length > 0 && (
              <div className="flex justify-between items-center py-2 border-b border-base-200">
                <span className="text-base-content/60 font-medium flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Formats
                </span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {book.formats.map((fmt) => (
                    <span key={fmt} className="badge badge-outline badge-xs opacity-70">
                      {fmt.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {book.read_status && (
              <div className="flex justify-between items-center py-2 border-b border-base-200">
                <span className="text-base-content/60 font-medium">Status</span>
                <span className={`badge badge-sm ${getStatusColor(book.read_status)}`}>
                  {book.read_status}
                </span>
              </div>
            )}

            {book.tags && book.tags.length > 0 && (
              <div className="py-2">
                <span className="text-base-content/60 font-medium flex items-center gap-1 mb-2">
                  <Tag className="w-3 h-3" /> Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {book.tags.map((tag) => (
                    <span key={tag} className="badge badge-ghost badge-sm border-base-300">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {book.path && (
              <div className="py-2 mt-2">
                <span className="text-xs text-base-content/50 font-medium">File Path</span>
                <p className="text-[10px] font-mono text-base-content/60 break-all bg-base-200 p-2 rounded mt-1 border border-base-300">
                  {book.path}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          {onAction && actionLabel && (
            <div className="w-full mt-6 flex gap-2">
              <button
                type="button"
                className={`btn flex-1 ${actionColor === "green" ? "btn-success text-white" : "btn-primary"}`}
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
            </div>
          )}
        </div>
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
