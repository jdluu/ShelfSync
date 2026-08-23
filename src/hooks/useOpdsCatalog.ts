import { useQuery } from "@tanstack/react-query";
import { opdsClient } from "@/services/opdsClient";
import type { Catalog } from "@/types/opds";

export const opdsQueries = {
  all: ["opds"] as const,
  catalog: (url: string, page: number) => ({
    queryKey: [...opdsQueries.all, "catalog", url, `page-${page}`] as const,
  }),
};

export const useOpdsCatalog = (
  url: string,
  username: string | undefined,
  password: string | undefined,
  page: number = 1,
  enabled: boolean = false,
) => {
  return useQuery<Catalog>({
    queryKey: [...opdsQueries.all, "catalog", url, `page-${page}`] as const,
    queryFn: async () => {
      if (!username || !password) {
        throw new Error("Username and password are required");
      }
      return opdsClient.fetchCatalog({ url, username, password, page });
    },
    enabled: enabled && !!url && !!username && !!password,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === "Username and password are required") {
        return false;
      }
      return failureCount < 3;
    },
  });
};
