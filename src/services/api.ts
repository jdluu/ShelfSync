import { invoke } from "@tauri-apps/api/core";
import type { Book, ConnectionInfo } from "@/types/core";

/**
 * Central API interface for communicating with the Tauri backend.
 */
export const api = {
  /**
   * Library management commands.
   */
  library: {
    /**
     * Retrieves the list of books from the specified Calibre library path.
     */
    getBooks: (libraryPath: string) => invoke<Book[]>("get_books", { libraryPath }),

    /**
     * Sets the root path for the host's Calibre library.
     */
    setLibraryPath: (path: string) => invoke<void>("set_library_path", { path }),

    /**
     * Triggers a bulk synchronization for the specified book IDs.
     */
    startBulkSync: (bookIds: number[]) => invoke<void>("start_bulk_sync", { bookIds }),
  },
  /**
   * Network and discovery commands.
   */
  network: {
    /**
     * Retrieves the host's local connection information (IP/Port).
     */
    getConnectionInfo: () => invoke<ConnectionInfo>("get_connection_info"),

    /**
     * Discovers other active ShelfSync hosts on the local network.
     */
    discoverHosts: () => invoke<ConnectionInfo[]>("discover_hosts"),
  },
};
