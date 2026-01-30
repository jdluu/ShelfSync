import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Book } from "@/types";
import { Host } from "@/context/DiscoveryContext";

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
 * @param host - The connected host object.
 * @param token - The authentication token.
 * @param enabled - Whether the query should run (e.g., only in client mode).
 * @returns A query result containing the list of books.
 */
export const useHostManifest = (
  host: Host | null,
  token: string | undefined,
  enabled: boolean
) => {
  return useQuery({
    queryKey: libraryKeys.manifest(host ? `${host.ip}:${host.port}` : ""),
    queryFn: async () => {
      if (!host) throw new Error("No host selected");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(`http://${host.ip}:${host.port}/api/manifest`, {
        headers,
      });

      if (response.status === 401) {
        throw new Error("Unauthorized");
      }

      if (!response.ok) {
        throw new Error("Failed to fetch manifest");
      }

      return response.json() as Promise<Book[]>;
    },
    enabled: enabled && !!host,
    retry: (failureCount, error) => {
        // Don't retry on 401s
        if (error.message === "Unauthorized") return false;
        return failureCount < 3;
    }
  });
};

/**
 * Fetches books from the local Calibre database (Host Mode).
 *
 * @param libraryPath - The absolute path to the Calibre library.
 * @returns A query result containing the list of books.
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
 * Verifies the PIN with the host to get an auth token.
 *
 * @returns A mutation to verify the PIN and retrieve the token.
 */
export const useCheckPin = () => {
  return useMutation({
    mutationFn: async ({ host, pin }: { host: Host; pin: string }) => {
      const response = await fetch(`http://${host.ip}:${host.port}/api/check-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        throw new Error("Invalid PIN");
      }

      const data = await response.json();
      return data.token as string;
    },
  });
};
