import { ChevronDown, ChevronUp } from "lucide-react";
import type React from "react";
import type { Book, Host } from "@/types/core";
import type { SyncProgress } from "@/types/library";
import { ClientBookGrid } from "./ClientBookGrid";

interface ClientGroupedGridProps {
  groupedBooks: Map<string, Book[]>;
  collapsedGroups: Set<string>;
  toggleGroupCollapse: (groupName: string) => void;
  selectGroup: (groupBooks: Book[]) => void;
  getGroupSelectLabel: (isSelected: boolean) => string;
  isGroupSelected: (groupBooks: Book[]) => boolean;
  viewMode: "grid" | "list";
  activeTab: "explore" | "library";
  connectedHost: Host | null;
  token?: string;
  selectedIds: Set<number>;
  selectionMode: boolean;
  syncProgress: Record<number, SyncProgress>;
  openLocalBook: (path: string) => void;
  syncBook: (book: Book) => void;
  toggleSelection: (id: number) => void;
  handleToggleStatus: (book: Book) => void;
  handleInfoClick: (book: Book, coverUrl?: string) => void;
}

export const ClientGroupedGrid: React.FC<ClientGroupedGridProps> = ({
  groupedBooks,
  collapsedGroups,
  toggleGroupCollapse,
  selectGroup,
  getGroupSelectLabel,
  isGroupSelected,
  ...gridProps
}) => {
  return (
    <div className="space-y-12">
      {[...groupedBooks.entries()].map(([groupName, groupBooks]) => (
        <section key={groupName} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-6 px-1 gap-2">
            <button
              type="button"
              className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity text-left outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg p-1 -ml-1"
              onClick={() => toggleGroupCollapse(groupName)}
              aria-expanded={!collapsedGroups.has(groupName)}
              aria-controls={`group-grid-${groupName.replace(/\s+/g, "-")}`}
            >
              <h3 className="text-xl font-bold tracking-tight truncate">{groupName}</h3>
              <span className="badge badge-ghost font-mono text-[10px] opacity-50 shrink-0">
                {groupBooks.length} items
              </span>
              {collapsedGroups.has(groupName) ? (
                <ChevronDown className="w-5 h-5 text-base-content/50 shrink-0" />
              ) : (
                <ChevronUp className="w-5 h-5 text-base-content/50 shrink-0" />
              )}
            </button>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                className="btn btn-xs btn-ghost text-primary"
                onClick={() => selectGroup(groupBooks)}
              >
                {getGroupSelectLabel(isGroupSelected(groupBooks))}
              </button>
            </div>
          </div>
          <div
            id={`group-grid-${groupName.replace(/\s+/g, "-")}`}
            className={`transition-all duration-300 ${
              collapsedGroups.has(groupName) ? "hidden" : "block"
            }`}
          >
            <ClientBookGrid books={groupBooks} {...gridProps} />
          </div>
        </section>
      ))}
    </div>
  );
};
