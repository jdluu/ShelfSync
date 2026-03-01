import { LayoutGrid, List } from "lucide-react";
import type React from "react";
import { SearchBar } from "@/components/ui/SearchBar";
import { SortMenu, type SortOption } from "@/components/ui/SortMenu";

interface ClientToolbarProps {
  refresh: () => void;
  loading: boolean;
  selectionMode: boolean;
  toggleSelectionMode: () => void;
  viewMode: "list" | "grid";
  setViewMode: (mode: "list" | "grid") => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  sortOption: SortOption;
  setSortOption: (option: SortOption) => void;
  selectedCount: number;
  selectAll: () => void;
  selectNone: () => void;
  bookCount: number;
  showScrollTop: boolean;
}

/**
 * Sticky toolbar for the Client Dashboard.
 *
 * Contains disconnect/refresh actions, view mode toggle, selection mode controls,
 * search bar, and sort menu.
 */
export const ClientToolbar: React.FC<ClientToolbarProps> = ({
  refresh,
  loading,
  selectionMode,
  toggleSelectionMode,
  viewMode,
  setViewMode,
  searchTerm,
  setSearchTerm,
  sortOption,
  setSortOption,
  selectedCount,
  selectAll,
  selectNone,
  bookCount,
  showScrollTop,
}) => {
  return (
    <div
      className="sticky top-[72px] z-[900] bg-base-100/95 backdrop-blur-sm px-1 py-3 border-b border-base-200 flex flex-col gap-3 transition-shadow duration-300"
      style={{ boxShadow: showScrollTop ? "0 4px 6px -1px rgb(0 0 0 / 0.1)" : "none" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-lg font-bold">Available Books</h2>
            <span className="badge badge-primary badge-sm py-1 font-medium">{bookCount}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={refresh}
              className="btn btn-xs btn-circle btn-ghost"
              title="Refresh Library"
              aria-label="Refresh library"
              disabled={loading}
            >
              <svg
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSelectionMode}
            className={`btn btn-xs sm:btn-sm ${selectionMode ? "btn-primary" : "btn-ghost border-base-300"}`}
          >
            {selectionMode ? "Done" : "Select"}
          </button>

          <fieldset
            className="flex items-center gap-1 bg-base-200 p-0.5 rounded-lg border border-base-300"
            aria-label="View mode"
          >
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`btn btn-xs btn-square ${viewMode === "grid" ? "btn-primary" : "btn-ghost"}`}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`btn btn-xs btn-square ${viewMode === "list" ? "btn-primary" : "btn-ghost"}`}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </fieldset>
        </div>
      </div>

      {selectionMode && (
        <div className="flex items-center gap-2 bg-primary/10 p-2 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-top-2">
          <span className="text-xs font-bold text-primary px-1">{selectedCount} selected</span>
          <div className="flex gap-1 ml-auto">
            <button
              type="button"
              className="btn btn-[10px] h-7 min-h-0 btn-ghost text-primary hover:bg-primary/20"
              onClick={selectAll}
              aria-label="Select all books"
            >
              All
            </button>
            <button
              type="button"
              className="btn btn-[10px] h-7 min-h-0 btn-ghost text-primary hover:bg-primary/20"
              onClick={selectNone}
              aria-label="Deselect all books"
            >
              None
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 w-full">
        <div className="flex-1">
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
        </div>
        <div className="shrink-0">
          <SortMenu value={sortOption} onChange={setSortOption} />
        </div>
      </div>
    </div>
  );
};
