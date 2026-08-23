import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { opdsQueries, useOpdsCatalog } from "@/hooks/useOpdsCatalog";

const createTestQueryClient = () => {
  return new QueryClient();
};

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

vi.mock("@/services/opdsClient", () => ({
  opdsClient: {
    fetchCatalog: vi.fn(),
  },
}));

describe("opdsQueries.catalog", () => {
  it("creates query key with URL and page but never credentials", () => {
    const url = "https://example.com/opds";
    const page = 2;

    const queryKey = opdsQueries.catalog(url, page).queryKey;

    expect(queryKey).toEqual(["opds", "catalog", url, "page-2"]);
    expect(queryKey).not.toContain("username");
    expect(queryKey).not.toContain("password");
    expect(queryKey).not.toContain("testuser");
    expect(queryKey).not.toContain("testpass");
    expect(JSON.stringify(queryKey)).not.toMatch(/password|username/i);
  });

  it("creates unique keys for different URLs", () => {
    const key1 = opdsQueries.catalog("https://api1.example.com/opds", 1).queryKey;
    const key2 = opdsQueries.catalog("https://api2.example.com/opds", 1).queryKey;

    expect(key1).not.toEqual(key2);
  });

  it("creates unique keys for different pages", () => {
    const key1 = opdsQueries.catalog("https://example.com/opds", 1).queryKey;
    const key2 = opdsQueries.catalog("https://example.com/opds", 2).queryKey;

    expect(key1).not.toEqual(key2);
  });
});

describe("useOpdsCatalog", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("is disabled by default when enabled is false", () => {
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(
      () => useOpdsCatalog("https://example.com/opds", "testuser", "testpass", 1, false),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it("is disabled when username or password is undefined", () => {
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(
      () =>
        useOpdsCatalog(
          "https://example.com/opds",
          undefined as unknown as string,
          "testpass",
          1,
          true,
        ),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
  });

  it("is disabled when URL is empty", () => {
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => useOpdsCatalog("", "testuser", "testpass", 1, true), {
      wrapper,
    });

    expect(result.current.isLoading).toBe(false);
  });
});
