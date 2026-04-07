import type React from "react";
import type { Book } from "@/types/core";

interface BookMetadataProps {
  book: Book;
  compact?: boolean;
  id?: string;
}

export const BookMetadata: React.FC<BookMetadataProps> = ({ book, compact, id }) => {
  if (compact) {
    return (
      <div className="flex flex-col w-full px-1 z-10">
        <h3
          id={id}
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
          <p
            className="text-[9px] font-bold text-accent mt-0.5 truncate"
            title={`${book.series}${book.series_index ? ` #${book.series_index}` : ""}`}
          >
            {book.series}
            {book.series_index ? ` #${book.series_index}` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <h3 id={id} className="text-sm font-bold truncate w-full" title={book.title}>
        {book.title}
      </h3>
      <p className="text-sm text-base-content/70 truncate w-full" title={book.authors}>
        {book.authors}
      </p>

      {book.series && (
        <p className="text-[10px] sm:text-xs font-bold text-accent -mt-0.5 max-w-full truncate">
          {book.series}
          {book.series_index ? ` #${book.series_index}` : ""}
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
    </>
  );
};
