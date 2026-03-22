import { Book as BookIcon } from "lucide-react";
import { m } from "motion/react";
import type React from "react";
import type { Book } from "@/types/core";

interface BookCoverProps {
  book: Book;
  coverUrl?: string;
  imgError: boolean;
  imgLoaded: boolean;
  isDownloading: boolean;
  syncProgress?: number;
  handleImageError: () => void;
  handleImageLoad: () => void;
  onInfoClick?: (book: Book, coverUrl?: string) => void;
  compact?: boolean;
}

export const BookCover: React.FC<BookCoverProps> = ({
  book,
  coverUrl,
  imgError,
  imgLoaded,
  isDownloading,
  syncProgress,
  handleImageError,
  handleImageLoad,
  onInfoClick,
  compact,
}) => {
  const containerClass = compact
    ? "w-full aspect-[2/3] bg-base-300/50 rounded-xl overflow-hidden flex items-center justify-center relative shadow-sm max-w-[120px] mx-auto outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer group/image ring-1 ring-base-content/5"
    : "w-16 h-24 sm:w-20 sm:h-28 bg-base-300/50 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center relative shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer group/image ring-1 ring-base-content/5";

  return (
    <button
      type="button"
      className={containerClass}
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
          <m.img
            layoutId={`book-cover-${book.id}`}
            src={coverUrl}
            alt={`Cover of ${book.title}`}
            className={`w-full h-full object-cover transition-transform duration-500 group-hover/image:scale-110 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
        </>
      ) : (
        <m.div
          layoutId={`book-cover-${book.id}`}
          className="w-full h-full flex items-center justify-center"
        >
          <BookIcon
            className="w-8 h-8 text-base-content/30 group-hover/image:scale-110 group-hover/image:text-primary transition-all duration-300"
            aria-hidden="true"
          />
        </m.div>
      )}

      {/* Overlay Gradient for Image */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity duration-300" />

      {isDownloading && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1.5 backdrop-blur-sm">
          <progress
            className="progress progress-primary w-full h-1.5"
            value={(syncProgress || 0) * 100}
            max="100"
          />
        </div>
      )}
    </button>
  );
};
