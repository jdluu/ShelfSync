import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SortOption } from "@/components/ui/SortMenu";
import { useHostManifest } from "@/hooks/useLibraryQuery";
import { useSyncProgress } from "@/hooks/useSyncProgress";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { useSyncStore } from "@/store/syncStore";
import type { Book } from "@/types/core";
import { isTauri } from "@/utils/tauri";

export type GroupByOption = "none" | "series" | "author" | "tag";

/**
 * Custom hook encapsulating all ClientDashboard state and business logic.
 *
 * Provides:
 * - Remote/local book data with filtering and sorting
 * - Connection state (host, token, auth checks)
 * - Sync actions (individual + bulk)
 * - Selection mode management
 * - Scroll-to-top visibility
 * - Keyboard shortcuts (Escape to exit selection, Ctrl+A to select all)
 */
export function useClientDashboard() {
  const {
    appMode,
    offlineStoragePath,
    localBooks,
    toggleReadStatus,
    setLocalBooks,
    selectOfflineStorageFolder,
    deleteLocalBook,
  } = useLibraryStore();
  const { connectedHost, authTokens, setAuthRequired, setPairingHost, connect, disconnect } =
    useAuthStore();
  const { syncProgress, manualError, clearError, syncBooks } = useSyncStore();

  const hostKey = connectedHost ? `${connectedHost.ip}:${connectedHost.port}` : "";
  const token = authTokens[hostKey];

  const remoteQuery = useHostManifest(connectedHost, token, appMode === "client");

  const books = remoteQuery.data || [];
  const loading = remoteQuery.isLoading;
  const error =
    manualError ||
    (remoteQuery.error?.message !== "Unauthorized" ? remoteQuery.error?.message : null);

  const booksRef = useRef(books);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  useSyncProgress(booksRef, offlineStoragePath, setLocalBooks);

  useEffect(() => {
    if (remoteQuery.error?.message === "Unauthorized") {
      setAuthRequired(true);
      setPairingHost(connectedHost);
    } else {
      setAuthRequired(false);
    }
  }, [remoteQuery.error, connectedHost, setAuthRequired, setPairingHost]);

  const refresh = async () => {
    await remoteQuery.refetch();
  };

  const openLocalBook = async (path: string) => {
    if (isTauri()) {
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(path);
    } else {
      console.warn("Opening book path in browser (not supported):", path);
    }
  };

  const syncBook = async (book: Book) => {
    if (connectedHost && token) {
      await syncBooks([book], connectedHost, token, offlineStoragePath);
    }
  };

  const handleToggleStatus = (book: Book) => {
    return toggleReadStatus(book, connectedHost, token);
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("title");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [activeTab, setActiveTab] = useState<"explore" | "library">("explore");
  const [groupBy, setGroupBy] = useState<GroupByOption>("series");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showScrollTop, setShowScrollTop] = useState(false);

  const toggleGroupCollapse = (groupName: string) => {
    const next = new Set(collapsedGroups);
    if (next.has(groupName)) next.delete(groupName);
    else next.add(groupName);
    setCollapsedGroups(next);
  };

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const filterAndSort = useCallback(
    (list: Book[]) => {
      let result = [...list];

      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        result = result.filter(
          (b) =>
            b.title?.toLowerCase().includes(lower) ||
            false ||
            b.authors?.toLowerCase().includes(lower) ||
            false ||
            b.series?.toLowerCase().includes(lower) ||
            false ||
            b.tags?.some((t) => t.toLowerCase().includes(lower)) ||
            false,
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

  /** Group filtered books into a Map<groupName, Book[]> by the selected field. */
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

    // Sort groups alphabetically, but put Standalone last
    // Additionally, if grouping by series, sort the books inside each series by index
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
  const selectNone = () => setSelectedIds(new Set());

  const startBulkSync = async () => {
    const toSync = books.filter((b: Book) => selectedIds.has(b.id));
    if (connectedHost && token) {
      await syncBooks(toSync, connectedHost, token, offlineStoragePath).catch((e) =>
        console.error("Batch sync failed:", e),
      );
    }
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const startBulkDelete = async () => {
    const toDelete = localBooks.filter((b: Book) => selectedIds.has(b.id));
    for (const book of toDelete) {
      await deleteLocalBook(book).catch((e) => console.error("Failed to delete book:", e));
    }
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  /** Toggle selection of all books in a given group. */
  const selectGroup = (groupBooks: Book[]) => {
    setSelectionMode(true);
    const next = new Set(selectedIds);
    const allSelected = groupBooks.every(b => next.has(b.id));

    if (allSelected) {
      for (const b of groupBooks) next.delete(b.id);
      if (next.size === 0) setSelectionMode(false);
    } else {
      for (const b of groupBooks) next.add(b.id);
    }
    setSelectedIds(next);
  };

  return {
    connectedHost,
    connect,
    disconnect,
    books,
    loading,
    error,
    clearError,
    refresh,
    syncBook,
    openLocalBook,
    handleToggleStatus,
    syncProgress,
    searchTerm,
    setSearchTerm,
    sortOption,
    setSortOption,
    selectionMode,
    setSelectionMode,
    selectedIds,
    setSelectedIds,
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab: (tab: "explore" | "library") => {
      setActiveTab(tab);
      setSelectionMode(false);
      setSelectedIds(new Set());
    },
    showScrollTop,
    filteredRemoteBooks,
    filteredLocalBooks,
    localBooks,
    token,
    toggleSelection,
    selectAll,
    selectNone,
    startBulkSync,
    startBulkDelete,
    offlineStoragePath,
    selectOfflineStorageFolder,
    deleteLocalBook,
    groupBy,
    setGroupBy,
    groupedBooks,
    selectGroup,
    collapsedGroups,
    toggleGroupCollapse,
  };
}
