import { openPath } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { useInfiniteHostManifest } from "@/hooks/useLibraryQuery";
import { useSyncProgress } from "@/hooks/useSyncProgress";
import { useAuthStore } from "@/store/authStore";
import { useLibraryStore } from "@/store/libraryStore";
import { useSyncStore } from "@/store/syncStore";
import { isTauri } from "@/utils/tauri";
import { useBookFilters } from "./useBookFilters";
import { useBookSelection } from "./useBookSelection";
import { useBookSyncActions } from "./useBookSyncActions";

export function useClientDashboard() {
  const {
    appMode,
    offlineStoragePath,
    localBooks,
    setLocalBooks,
    selectOfflineStorageFolder,
    deleteLocalBook,
  } = useLibraryStore();
  const { connectedHost, authTokens, setAuthRequired, setPairingHost, connect, disconnect } =
    useAuthStore();
  const { syncProgress, manualError, clearError } = useSyncStore();

  const hostKey = connectedHost ? `${connectedHost.ip}:${connectedHost.port}` : "";
  const token = authTokens[hostKey];

  const remoteQuery = useInfiniteHostManifest(connectedHost, token, appMode === "client");

  const books = remoteQuery.data?.pages.flatMap((p) => p.books) || [];
  const libraryVersion = remoteQuery.data?.pages[0]?.version;
  const lastVersionRef = useRef<string | undefined>(undefined);

  const loading = remoteQuery.isLoading;
  const error =
    manualError ||
    (remoteQuery.error?.message !== "Unauthorized" ? remoteQuery.error?.message : null);

  useEffect(() => {
    if (libraryVersion && lastVersionRef.current && libraryVersion !== lastVersionRef.current) {
      useToastStore.getState().addToast("Host library has been updated.", "info");
    }
    if (libraryVersion) {
      lastVersionRef.current = libraryVersion;
    }
  }, [libraryVersion]);

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
      await openPath(path);
    } else {
      console.warn("Opening book path in browser (not supported):", path);
    }
  };

  // 1. Compose Filters
  const filters = useBookFilters(books, localBooks);

  // 2. Compose Selection
  const selection = useBookSelection(filters.activeBooks);

  // 3. Compose Sync Actions
  const syncActions = useBookSyncActions(connectedHost, token, offlineStoragePath);

  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleStartBulkSync = () =>
    syncActions.startBulkSync(books, selection.selectedIds, () => {
      selection.setSelectionMode(false);
      selection.setSelectedIds(new Set());
    });

  const handleStartBulkDelete = () =>
    syncActions.startBulkDelete(localBooks, selection.selectedIds, () => {
      selection.setSelectionMode(false);
      selection.setSelectedIds(new Set());
    });

  return {
    connectedHost,
    connect,
    disconnect,
    books,
    loading,
    error,
    clearError,
    refresh,
    syncBook: syncActions.syncBook,
    openLocalBook,
    handleToggleStatus: syncActions.handleToggleStatus,
    syncProgress,
    searchTerm: filters.searchTerm,
    setSearchTerm: filters.setSearchTerm,
    sortOption: filters.sortOption,
    setSortOption: filters.setSortOption,
    selectionMode: selection.selectionMode,
    setSelectionMode: selection.setSelectionMode,
    selectedIds: selection.selectedIds,
    setSelectedIds: selection.setSelectedIds,
    viewMode,
    setViewMode,
    activeTab: filters.activeTab,
    setActiveTab: (tab: "explore" | "library") => {
      filters.setActiveTab(tab);
      selection.setSelectionMode(false);
      selection.setSelectedIds(new Set());
    },
    showScrollTop,
    filteredRemoteBooks: filters.filteredRemoteBooks,
    filteredLocalBooks: filters.filteredLocalBooks,
    localBooks,
    token,
    toggleSelection: selection.toggleSelection,
    selectAll: selection.selectAll,
    selectNone: selection.selectNone,
    startBulkSync: handleStartBulkSync,
    startBulkDelete: handleStartBulkDelete,
    offlineStoragePath,
    selectOfflineStorageFolder,
    deleteLocalBook,
    groupBy: filters.groupBy,
    setGroupBy: filters.setGroupBy,
    groupedBooks: filters.groupedBooks,
    selectGroup: selection.selectGroup,
    collapsedGroups: filters.collapsedGroups,
    toggleGroupCollapse: filters.toggleGroupCollapse,
    fetchNextPage: remoteQuery.fetchNextPage,
    hasNextPage: remoteQuery.hasNextPage,
    isFetchingNextPage: remoteQuery.isFetchingNextPage,
  };
}
