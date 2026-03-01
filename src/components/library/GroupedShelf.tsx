import { ChevronRight, Download } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import type { Book } from "@/types/core";

interface GroupedShelfProps {
  title: string;
  books: Book[];
  viewMode: "grid" | "list";
  renderItem: (book: Book) => React.ReactNode;
  onSyncAll?: (books: Book[]) => void;
  onSelectAll?: (books: Book[]) => void;
}

/**
 * A single shelf row for grouped browsing.
 *
 * Grid mode renders a horizontal scrollable strip of book cards.
 * List mode renders a vertical list under the header.
 */
export const GroupedShelf: React.FC<GroupedShelfProps> = ({
  title,
  books,
  viewMode,
  renderItem,
  onSyncAll,
  onSelectAll,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 300, behavior: "smooth" });
  };

  return (
    <section className="mb-6">
      {/* Group header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm sm:text-base font-bold text-base-content truncate">{title}</h3>
          <span className="badge badge-ghost badge-xs font-medium shrink-0">{books.length}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onSelectAll && (
            <button
              type="button"
              className="btn btn-xs btn-ghost text-primary font-medium"
              onClick={() => onSelectAll(books)}
              aria-label={`Select all in ${title}`}
            >
              Select
            </button>
          )}
          {onSyncAll && (
            <button
              type="button"
              className="btn btn-xs btn-ghost text-primary font-medium gap-1"
              onClick={() => onSyncAll(books)}
              aria-label={`Sync all in ${title}`}
            >
              <Download className="w-3 h-3" />
              Sync
            </button>
          )}
        </div>
      </div>

      {/* Book strip */}
      {viewMode === "grid" ? (
        <div className="relative group/shelf">
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto scroll-smooth pb-2 snap-x snap-mandatory scrollbar-none"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {books.map((book) => (
              <div key={book.id} className="flex-shrink-0 w-[140px] sm:w-[160px] snap-start">
                {renderItem(book)}
              </div>
            ))}
          </div>
          {/* Scroll hint arrow (desktop only) */}
          {books.length > 4 && (
            <button
              type="button"
              onClick={scrollRight}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 hidden sm:group-hover/shelf:flex items-center justify-center w-8 h-16 bg-base-100/90 border border-base-300 rounded-l-lg shadow-lg backdrop-blur-sm"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-4 h-4 text-base-content/70" />
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {books.map((book) => (
            <div key={book.id}>{renderItem(book)}</div>
          ))}
        </div>
      )}
    </section>
  );
};
