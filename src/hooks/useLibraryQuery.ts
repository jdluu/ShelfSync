import { queryOptions, useQuery } from "@tanstack/react-query";
import { api, httpClient } from "@/services/apiClient";
import type { Host } from "@/types/core";

// --- Keys & Options ---
/**
 * Query keys and options for TanStack Query.
 */
export const libraryQueries = {
  all: ["library"] as const,
  manifest: (host: Host | null, token?: string) =>
    queryOptions({
      queryKey: [
        ...libraryQueries.all,
        "manifest",
        host ? `${host.ip}:${host.port}` : "",
        token || "no-token",
      ] as const,
      queryFn: async () => {
        if (!host) throw new Error("No host selected");
        return httpClient.getManifest(host, token);
      },
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message === "Unauthorized") return false;
        return failureCount < 3;
      },
    }),
  local: (libraryPath: string | null) =>
    queryOptions({
      queryKey: [...libraryQueries.all, "local", libraryPath || ""] as const,
      queryFn: async () => {
        if (!libraryPath) throw new Error("Library path not set");
        return api.library.getBooks(libraryPath);
      },
    }),
};

// --- Hooks ---

/**
 * Fetches the book manifest from a remote host.
 */
export const useHostManifest = (host: Host | null, token: string | undefined, enabled: boolean) => {
  return useQuery({
    ...libraryQueries.manifest(host, token),
    enabled: enabled && !!host,
  });
};

/**
 * Fetches books from the local Calibre database (Host Mode).
 */
export const useLocalLibrary = (libraryPath: string | null) => {
  return useQuery({
    ...libraryQueries.local(libraryPath),
    enabled: !!libraryPath,
  });
};
