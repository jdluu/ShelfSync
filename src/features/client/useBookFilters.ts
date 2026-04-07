import { useCallback, useMemo, useState } from "react";
import type { SortOption } from "@/components/ui/SortMenu";
import type { Book } from "@/types/core";

export type GroupByOption = "none" | "series" | "author" | "tag";

export function useBookFilters(books: Book[], localBooks: Book[]) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("title");
  const [groupBy, setGroupBy] = useState<GroupByOption>("series");
  const [activeTab, setActiveTab] = useState<"explore" | "library">("explore");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroupCollapse = (groupName: string) => {
    const next = new Set(collapsedGroups);
    if (next.has(groupName)) next.delete(groupName);
    else next.add(groupName);
    setCollapsedGroups(next);
  };

  const filterAndSort = useCallback(
    (list: Book[]) => {
      let result = [...list];

      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        result = result.filter(
          (b) =>
            b.title?.toLowerCase().includes(lower) ||
            b.authors?.toLowerCase().includes(lower) ||
            b.series?.toLowerCase().includes(lower) ||
            b.tags?.some((t) => t.toLowerCase().includes(lower)),
        );
      }

      result.sort((a, b) => {
        if (sortOption === "title") return a.title.localeCompare(b.title);
        if (sortOption === "author") return a.authors.localeCompare(b.authors);
        if (sortOption === "recent") return (b.id || 0) - (a.id || 0);
        if (sortOption === "series") {
          const sA = a.series || "";
          const sB = b.series || "";
          if (sA !== sB) return sA.localeCompare(sB);
          return (a.series_index || 0) - (b.series_index || 0);
        }
        return 0;
      });

      return result;
    },
    [searchTerm, sortOption],
  );

  const filteredRemoteBooks = useMemo(() => filterAndSort(books), [books, filterAndSort]);
  const filteredLocalBooks = useMemo(() => filterAndSort(localBooks), [localBooks, filterAndSort]);

  const activeBooks = useMemo(() => {
    return activeTab === "explore" ? filteredRemoteBooks : filteredLocalBooks;
  }, [activeTab, filteredRemoteBooks, filteredLocalBooks]);

  const groupedBooks = useMemo(() => {
    if (groupBy === "none") return null;

    const groups = new Map<string, Book[]>();
    const standaloneKey = "Standalone";

    for (const book of activeBooks) {
      let keys: string[] = [];

      if (groupBy === "series") {
        keys = book.series ? [book.series] : [];
      } else if (groupBy === "author") {
        keys = book.authors
          ? book.authors
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean)
          : [];
      } else if (groupBy === "tag") {
        keys = book.tags?.length ? book.tags : [];
      }

      if (keys.length === 0) {
        const list = groups.get(standaloneKey) || [];
        list.push(book);
        groups.set(standaloneKey, list);
      } else {
        for (const key of keys) {
          const list = groups.get(key) || [];
          list.push(book);
          groups.set(key, list);
        }
      }
    }

    const sorted = new Map(
      [...groups.entries()]
        .map(([key, list]) => {
          if (groupBy === "series" && key !== standaloneKey) {
            const sortedList = [...list].sort(
              (a, b) => (a.series_index || 0) - (b.series_index || 0),
            );
            return [key, sortedList] as [string, Book[]];
          }
          return [key, list] as [string, Book[]];
        })
        .sort(([a], [b]) => {
          if (a === standaloneKey) return 1;
          if (b === standaloneKey) return -1;
          return a.localeCompare(b);
        }),
    );

    return sorted;
  }, [groupBy, activeBooks]);

  return {
    searchTerm,
    setSearchTerm,
    sortOption,
    setSortOption,
    groupBy,
    setGroupBy,
    activeTab,
    setActiveTab,
    filteredRemoteBooks,
    filteredLocalBooks,
    activeBooks,
    groupedBooks,
    collapsedGroups,
    toggleGroupCollapse,
  };
}
