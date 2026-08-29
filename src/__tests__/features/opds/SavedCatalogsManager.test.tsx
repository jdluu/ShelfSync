import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavedCatalogsManager } from "@/features/opds/SavedCatalogsManager";
import type { SavedCatalog } from "@/services/savedCatalogs";
import { savedCatalogsService } from "@/services/savedCatalogs";

vi.mock("@/services/savedCatalogs", () => ({
  savedCatalogsService: {
    list: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
}));

const createCatalog = (overrides?: Partial<SavedCatalog>): SavedCatalog => ({
  id: "cat-1",
  name: "Type Theory",
  url: "https://type-theory.example/opds",
  username: "alice",
  added_at: "2026-08-28T00:00:00Z",
  ...overrides,
});

const connectName = (name: string): string => `Connect to ${name}`;
const removeName = (name: string): string => `Remove ${name} from saved catalogs`;
const connectButton = (name: string): HTMLButtonElement =>
  screen.getByRole("button", { name: connectName(name) });
const removeButton = (name: string): HTMLButtonElement =>
  screen.getByRole("button", { name: removeName(name) });

async function renderManager(onConnectTo?: (catalog: SavedCatalog) => void): Promise<void> {
  render(<SavedCatalogsManager onConnectTo={onConnectTo ?? vi.fn()} />);
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: connectName("Type Theory") })).not.toBeNull();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(savedCatalogsService.list).mockResolvedValue([createCatalog()]);
});

afterEach(() => {
  cleanup();
});

describe("SavedCatalogsManager", () => {
  it("renders connect and remove actions with exact labels and aria-labels", async () => {
    await renderManager();

    const connect = connectButton("Type Theory");
    expect(connect.textContent).toContain("Connect");
    expect(connect.getAttribute("aria-label")).toBe("Connect to Type Theory");

    const remove = removeButton("Type Theory");
    expect(remove.getAttribute("aria-label")).toBe("Remove Type Theory from saved catalogs");
  });

  it("stamps the connect action with the shared primary button classes", async () => {
    await renderManager();

    const connect = connectButton("Type Theory");
    expect(connect.getAttribute("class")).toBe("btn btn-primary btn-xs gap-1");
    expect(connect.getAttribute("type")).toBe("button");
  });

  it("stamps the remove action with the shared ghost error button classes", async () => {
    await renderManager();

    const remove = removeButton("Type Theory");
    expect(remove.getAttribute("class")).toBe("btn btn-ghost btn-xs btn-square text-error");
    expect(remove.getAttribute("type")).toBe("button");
  });

  it("forwards the row catalog to onConnectTo when connect is activated", async () => {
    const catalog = createCatalog();
    vi.mocked(savedCatalogsService.list).mockResolvedValue([catalog]);
    const onConnectTo = vi.fn();
    await renderManager(onConnectTo);

    fireEvent.click(connectButton("Type Theory"));

    expect(onConnectTo).toHaveBeenCalledTimes(1);
    expect(onConnectTo).toHaveBeenCalledWith(catalog);
  });

  it("deletes the catalog by id and refreshes the list afterwards", async () => {
    vi.mocked(savedCatalogsService.delete).mockResolvedValue(true);
    vi.mocked(savedCatalogsService.list)
      .mockResolvedValueOnce([createCatalog()])
      .mockResolvedValueOnce([]);
    await renderManager();

    fireEvent.click(removeButton("Type Theory"));

    await waitFor(() => {
      expect(savedCatalogsService.delete).toHaveBeenCalledWith("cat-1");
    });
    await waitFor(() => {
      expect(savedCatalogsService.list).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: connectName("Type Theory") })).toBeNull();
    });
  });

  it("disables the remove action and swaps the icon for a spinner while deletion is in flight", async () => {
    let resolveDelete: ((deleted: boolean) => void) | undefined;
    vi.mocked(savedCatalogsService.delete).mockImplementation(
      () => new Promise<boolean>((resolve) => (resolveDelete = resolve)),
    );
    await renderManager();

    const remove = removeButton("Type Theory");
    expect(remove.hasAttribute("disabled")).toBe(false);
    fireEvent.click(remove);

    await waitFor(() => {
      expect(remove.hasAttribute("disabled")).toBe(true);
    });
    const spinner = remove.querySelector(".loading");
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute("class")).toContain("loading-spinner");
    expect(remove.querySelector("svg")).toBeNull();

    await act(async () => {
      resolveDelete?.(true);
    });

    await waitFor(() => {
      expect(remove.hasAttribute("disabled")).toBe(false);
    });
    expect(remove.querySelector(".loading")).toBeNull();
    expect(remove.querySelector("svg")).not.toBeNull();
  });

  it("ties the deleting state to the exact row whose remove action was clicked", async () => {
    let resolveDelete: ((deleted: boolean) => void) | undefined;
    vi.mocked(savedCatalogsService.delete).mockImplementation(
      () => new Promise<boolean>((resolve) => (resolveDelete = resolve)),
    );
    vi.mocked(savedCatalogsService.list).mockResolvedValue([
      createCatalog({ id: "cat-a" }),
      createCatalog({ id: "cat-b", name: "Lambda Calculus" }),
    ]);
    await renderManager();

    const typeTheoryRemove = removeButton("Type Theory");
    const lambdaRemove = removeButton("Lambda Calculus");
    fireEvent.click(typeTheoryRemove);

    await waitFor(() => {
      expect(typeTheoryRemove.hasAttribute("disabled")).toBe(true);
    });
    expect(lambdaRemove.hasAttribute("disabled")).toBe(false);
    expect(connectButton("Lambda Calculus").hasAttribute("disabled")).toBe(false);

    await act(async () => {
      resolveDelete?.(true);
    });

    await waitFor(() => {
      expect(typeTheoryRemove.hasAttribute("disabled")).toBe(false);
    });
  });
});
