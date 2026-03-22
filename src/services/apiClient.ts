import type { Book, ConnectionInfo, Host } from "@/types/core";
import { BookSchema, ConnectionInfoSchema } from "@/types/schemas";
import { safeInvoke } from "@/utils/tauri";

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
    getBooks: (libraryPath: string) => {
      const trimmedPath = libraryPath.trim();
      if (!trimmedPath) return Promise.resolve([]);

      return safeInvoke<Book[]>("get_books", { libraryPath: trimmedPath }, []).then((res) => {
        const result = BookSchema.array().safeParse(res);
        if (!result.success) {
          console.error("Zod Validation Failed for getBooks:", result.error);
          throw new Error(`Data Validation Error: ${result.error.message}`);
        }
        return result.data;
      });
    },

    /**
     * Sets the root path for the host's Calibre library.
     */
    setLibraryPath: (path: string) => safeInvoke<void>("set_library_path", { path }),

    /**
     * Triggers a bulk synchronization for the specified book IDs.
     */
    startBulkSync: (bookIds: number[]) => safeInvoke<void>("start_bulk_sync", { bookIds }),
  },
  /**
   * Network and discovery commands.
   */
  network: {
    /**
     * Retrieves the host's local connection information (IP/Port).
     */
    getConnectionInfo: () =>
      safeInvoke<ConnectionInfo>("get_connection_info", undefined, {
        ip: "127.0.0.1",
        port: 1420,
        hostname: "Browser",
        pin: "0000",
      }).then((res) => ConnectionInfoSchema.parse(res)),

    /**
     * Discovers other active ShelfSync hosts on the local network.
     */
    discoverHosts: () =>
      safeInvoke<ConnectionInfo[]>("discover_hosts", undefined, []).then((res) =>
        ConnectionInfoSchema.array().parse(res),
      ),

    /**
     * Clears the discovered hosts cache and triggers a fresh mDNS scan.
     */
    refreshDiscovery: () => safeInvoke<void>("refresh_discovery"),
  },
};

/**
 * HTTP Client to communicate with remote Hosts via REST.
 */
export const httpClient = {
  /**
   * Retrieves the host's book manifest.
   *
   * @summary Fetches the complete list of books available on the remote host.
   * @param {Host} host - The host connection details including IP and port.
   * @param {string} [token] - Optional authentication bearer token.
   * @returns {Promise<Book[]>} A promise resolving to an array of Book objects.
   * @throws {Error} "Unauthorized" if the token is invalid (401), or "Failed to fetch manifest" for other network failures.
   * @sideEffects Performs an external HTTP GET request.
   */
  async getManifest(host: Host, token?: string): Promise<Book[]> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const response = await fetch(`http://${host.ip}:${host.port}/api/manifest`, { headers });
      if (response.status === 401) throw new Error("Unauthorized");
      if (!response.ok)
        throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
      return response.json();
    } catch (e: unknown) {
      console.error(`Fetch manifest error for http://${host.ip}:${host.port}/api/manifest:`, e);
      if (e instanceof TypeError && e.message === "Failed to fetch") {
        throw new Error("Failed to fetch: Connection refused or network isolated.");
      }
      throw e;
    }
  },

  /**
   * Validates a PIN against the host.
   *
   * @summary Submits a 4-digit PIN to the host's authentication endpoint.
   * @param {Host} host - The target host to authenticate against.
   * @param {string} pin - The numeric PIN code.
   * @returns {Promise<string>} A promise resolving to a secure authorization token.
   * @throws {Error} "Invalid PIN" if the response is not OK (e.g., 401 Unauthorized).
   * @sideEffects Performs an external HTTP POST request.
   */
  async checkPin(host: Host, pin: string): Promise<string> {
    const response = await fetch(`http://${host.ip}:${host.port}/api/check-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (!response.ok) throw new Error("Invalid PIN");
    const data = await response.json();
    return data.token;
  },

  /**
   * Fetches the user's reading progress for all known books, optionally filtered by timestamp for Delta Sync.
   *
   * @summary Retrieves tracked reading states (e.g., unread, reading, finished) from the host.
   * @param {Host} host - The target host connection details.
   * @param {string} token - The active bearer token for authorization.
   * @param {number} [since] - Optional Unix timestamp to fetch only progress updated since then.
   * @returns {Promise<{ book_id: number; status: string }[]>} A promise resolving to an array of progress tracking objects.
   * @throws {Error} "Failed to fetch progress" if the network request fails or returns non-OK status.
   * @sideEffects Performs an external HTTP GET request.
   */
  async getProgress(
    host: Host,
    token: string,
    since?: number,
  ): Promise<{ book_id: number; status: string }[]> {
    const url = since
      ? `http://${host.ip}:${host.port}/api/progress?since=${since}`
      : `http://${host.ip}:${host.port}/api/progress`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Failed to fetch progress");
    return response.json();
  },

  /**
   * Updates the user's reading progress for a specific book on the remote host.
   *
   * @summary Pushes a new reading status flag for a Book to the Host's database.
   * @param {Host} host - The host receiving the update.
   * @param {string} token - The active bearer token for authorization.
   * @param {number} bookId - The unique ID of the book being updated.
   * @param {string} status - The new status flag (e.g., 'finished').
   * @returns {Promise<void>} An empty promise indicating successful transmission.
   * @throws {Error} "Failed to push progress" if the response status is not OK.
   * @sideEffects Performs an external HTTP POST request, mutating state on the remote host.
   */
  async updateProgress(host: Host, token: string, bookId: number, status: string): Promise<void> {
    const response = await fetch(`http://${host.ip}:${host.port}/api/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ book_id: bookId, status }),
    });
    if (!response.ok) throw new Error("Failed to push progress");
  },
};
