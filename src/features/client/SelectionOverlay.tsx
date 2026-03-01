import type React from "react";

interface SelectionOverlayProps {
  selectedCount: number;
  selectAll: () => void;
  selectNone: () => void;
  onBulkSync: () => void;
}

/**
 * Floating bottom bar shown when books are selected in selection mode.
 *
 * Displays the selection count, select all/none actions, and a bulk sync button
 * with a confirmation step.
 */
export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  selectedCount,
  selectAll,
  selectNone,
  onBulkSync,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2500] bg-base-100 p-4 rounded-xl shadow-2xl border border-primary w-[calc(100%-2rem)] max-w-md"
      role="toolbar"
      aria-label="Book selection actions"
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <span className="font-bold">{selectedCount} selected</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={selectAll}
              aria-label="Select all books"
            >
              All
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={selectNone}
              aria-label="Deselect all books"
            >
              None
            </button>
          </div>
        </div>
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
      </div>
    </div>
  );
};
