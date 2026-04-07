import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { api, httpClient } from "@/services/apiClient";
import type { Host } from "@/types/core";

const PAGE_SIZE = 50;

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
  infiniteManifest: (host: Host | null, token?: string) =>
    infiniteQueryOptions({
      queryKey: [
        ...libraryQueries.all,
        "manifest",
        "infinite",
        host ? `${host.ip}:${host.port}` : "",
        token || "no-token",
      ] as const,
      queryFn: async ({ pageParam }) => {
        if (!host) throw new Error("No host selected");
        return httpClient.getManifest(host, token, PAGE_SIZE, pageParam);
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => {
        const nextOffset = allPages.length * PAGE_SIZE;
        return nextOffset < lastPage.totalCount ? nextOffset : undefined;
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
 * Fetches the book manifest from a remote host (Paginated/Infinite).
 */
export const useInfiniteHostManifest = (
  host: Host | null,
  token: string | undefined,
  enabled: boolean,
) => {
  return useInfiniteQuery({
    ...libraryQueries.infiniteManifest(host, token),
    enabled: enabled && !!host,
  });
};

/**
 * Fetches the book manifest from a remote host (Full list - legacy).
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
