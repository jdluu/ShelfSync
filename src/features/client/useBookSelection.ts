import { useEffect, useState } from "react";
import type { Book } from "@/types/core";

export function useBookSelection(activeBooks: Book[]) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectionMode(false);
        setSelectedIds(new Set());
      }
      if (selectionMode && (e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const allFilteredIds = new Set(activeBooks.map((b) => b.id));
        setSelectedIds(allFilteredIds);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [selectionMode, activeBooks]);

  const toggleSelection = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => setSelectedIds(new Set(activeBooks.map((b) => b.id)));
  const selectNone = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const selectGroup = (groupBooks: Book[]) => {
    setSelectionMode(true);
    const next = new Set(selectedIds);
    const allSelected = groupBooks.every((b) => next.has(b.id));

    if (allSelected) {
      for (const b of groupBooks) next.delete(b.id);
      if (next.size === 0) setSelectionMode(false);
    } else {
      for (const b of groupBooks) next.add(b.id);
    }
    setSelectedIds(next);
  };

  return {
    selectionMode,
    setSelectionMode,
    selectedIds,
    setSelectedIds,
    toggleSelection,
    selectAll,
    selectNone,
    selectGroup,
  };
}
