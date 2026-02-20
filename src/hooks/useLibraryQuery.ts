import { useMutation, useQuery } from "@tanstack/react-query";
import { api, httpClient } from "@/services/api";
import type { Host } from "@/types/core";

// --- Keys ---
/**
 * Query keys for TanStack Query.
 */
export const libraryKeys = {
  all: ["library"] as const,
  manifest: (host: string) => [...libraryKeys.all, "manifest", host] as const,
  local: (path: string) => [...libraryKeys.all, "local", path] as const,
};

// --- Hooks ---

/**
 * Fetches the book manifest from a remote host.
 *
 * @summary Integrates with React Query to fetch and cache a remote books manifest.
 * @param {Host | null} host - The connected host object containing IP and port.
 * @param {string | undefined} token - The authentication bearer token.
 * @param {boolean} enabled - Flag to control when the query executes.
 * @returns {UseQueryResult<Book[]>} A query result object containing the remote books payload.
 * @throws {Error} Yields an error if the host is missing or if network authentication fails.
 * @sideEffects Triggers a network request via `httpClient.getManifest` and caches the result.
 */
export const useHostManifest = (host: Host | null, token: string | undefined, enabled: boolean) => {
  return useQuery({
    queryKey: libraryKeys.manifest(host ? `${host.ip}:${host.port}` : ""),
    queryFn: async () => {
      if (!host) throw new Error("No host selected");
      return httpClient.getManifest(host, token);
    },
    enabled: enabled && !!host,
    retry: (failureCount, error) => {
      // Don't retry on 401s
      if (error.message === "Unauthorized") return false;
      return failureCount < 3;
    },
  });
};

/**
 * Fetches books from the local Calibre database (Host Mode).
 *
 * @summary Queries the local SQLite metadata database for all known calibre books.
 * @param {string | null} libraryPath - The absolute filesystem path to the Calibre library.
 * @returns {UseQueryResult<Book[]>} A query result containing the array of local Book structures.
 * @throws {Error} Throws an error if the library path is null or if the SQLite read fails.
 * @sideEffects Executes a Tauri IPC call to invoke the `get_books` Rust backend command.
 */
export const useLocalLibrary = (libraryPath: string | null) => {
  return useQuery({
    queryKey: libraryKeys.local(libraryPath || ""),
    queryFn: async () => {
      if (!libraryPath) throw new Error("Library path not set");
      return api.library.getBooks(libraryPath);
    },
    enabled: !!libraryPath,
  });
};

/**
 * Verifies the PIN with the host to authenticate a new client.
 *
 * @summary Provides a React Query mutation to submit a PIN and receive a long-lived auth token.
 * @returns {UseMutationResult<string, Error, { host: Host; pin: string }>} A mutation handle to execute the PIN check.
 * @throws {Error} Resolves to an error state if the PIN is invalid or the host rejects the connection.
 * @sideEffects Sends a POST request to the target host and may mutate UI state upon completion.
 */
export const useCheckPin = () => {
  return useMutation({
    mutationFn: async ({ host, pin }: { host: Host; pin: string }) => {
      return httpClient.checkPin(host, pin);
    },
  });
};
