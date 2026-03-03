import { ChevronDown, ChevronUp, X } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { Book } from "@/types/core";

interface SelectionOverlayProps {
  selectedBooks: Book[];
  selectAll: () => void;
  selectNone: () => void;
  onDeselect: (id: number) => void;
  onBulkSync?: () => void;
  onBulkDelete?: () => void;
  variant?: "sync" | "delete";
}

/**
 * Floating bottom bar shown when books are selected in selection mode.
 *
 * Displays the selection count, select all/none actions, and a bulk action button
 * with a confirmation step.
 */
export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  selectedBooks,
  selectAll,
  selectNone,
  onDeselect,
  onBulkSync,
  onBulkDelete,
  variant = "sync",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedCount = selectedBooks.length;
  
  // Sort books alphabetically for the summary list
  const sortedBooks = [...selectedBooks].sort((a, b) => a.title.localeCompare(b.title));

  if (selectedCount === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 z-[2500] bg-base-100 p-4 pb-8 sm:pb-4 rounded-t-2xl shadow-[0_-8px_30px_rgb(0,0,0,0.12)] border-t border-x border-primary w-full max-w-md transition-transform"
      role="toolbar"
      aria-label="Book selection actions"
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <button
            type="button"
            className="font-bold flex items-center gap-1 hover:text-primary transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-controls="selected-books-list"
          >
            {selectedCount} selected {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={selectAll}
              aria-label="Select all books"
            >
              {variant === "sync" ? "Select Library" : "Select Device"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={selectNone}
              aria-label="Clear selection"
            >
              Clear
            </button>
          </div>
        </div>

        {isExpanded && (
          <div 
            id="selected-books-list"
            className="max-h-40 overflow-y-auto bg-base-200/50 rounded-lg p-2 text-sm border border-base-content/5"
          >
            <ul className="space-y-1">
              {sortedBooks.map((book) => (
                <li key={book.id} className="flex items-center justify-between gap-2 group p-1 hover:bg-base-100 rounded-md transition-colors">
                  <span className="truncate select-none text-base-content/80 group-hover:text-base-content">
                    {book.title}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square opacity-50 hover:opacity-100 focus:opacity-100 transition-opacity"
                    onClick={() => onDeselect(book.id)}
                    aria-label={`Remove ${book.title} from selection`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {variant === "sync" && onBulkSync ? (
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => {
              if (
                window.confirm(
                  `Are you sure you want to download ${selectedCount} books to your device?`,
                )
              ) {
                onBulkSync();
              }
            }}
          >
            Sync Selected to Device
          </button>
        ) : variant === "delete" && onBulkDelete ? (
          <button
            type="button"
            className="btn btn-error w-full"
            onClick={() => {
              if (
                window.confirm(
                  `Are you sure you want to delete ${selectedCount} books from your device? This will remove the local files.`,
                )
              ) {
                onBulkDelete();
              }
            }}
          >
            Delete Selected
          </button>
        ) : null}
      </div>
    </div>
  );
};
