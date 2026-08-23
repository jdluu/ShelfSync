import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpdsCatalogView } from "@/features/opds/OpdsCatalogView";
import type { Catalog, Publication } from "@/types/opds";

const createMockCatalog = (overrides?: Partial<Catalog>): Catalog => {
  return {
    title: "Test OPDS Catalog",
    authors: ["Test Author"],
    links: [],
    publications: [],
    ...overrides,
  };
};

const createMockPublication = (overrides?: Partial<Publication>): Publication => {
  return {
    id: "pub-1",
    title: "Test Publication",
    authors: ["Test Author"],
    languages: ["en"],
    relations: [],
    descriptions: ["A test publication description that should be displayed in the card"],
    links: [],
    identifiers: {},
    ...overrides,
  };
};

describe("OpdsCatalogView", () => {
  afterEach(cleanup);

  describe("loading state", () => {
    it("shows loading state when loading is true and no catalog", () => {
      render(
        <OpdsCatalogView
          catalog={undefined}
          loading={true}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Loading catalog...")).not.toBeNull();
    });

    it("renders skeleton cards during loading", () => {
      render(
        <OpdsCatalogView
          catalog={undefined}
          loading={true}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      const skeletonCards = document.querySelectorAll(".animate-pulse");
      expect(skeletonCards.length).toBeGreaterThan(0);
    });

    it("does not show skeleton cards when catalog exists during loading", () => {
      const catalog = createMockCatalog({ title: "Existing Catalog" });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={true}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Existing Catalog")).not.toBeNull();
    });
  });

  describe("error state with retry", () => {
    it("shows error alert when error is present", () => {
      render(
        <OpdsCatalogView
          catalog={undefined}
          loading={false}
          error="Connection failed"
          page={1}
          onPageChange={vi.fn()}
          onRetry={vi.fn()}
        />,
      );

      expect(screen.getByRole("alert")).not.toBeNull();
      expect(screen.getByText("Unable to load catalog")).not.toBeNull();
      expect(screen.getByText("Connection failed")).not.toBeNull();
    });

    it("shows retry button when onRetry is provided", () => {
      const onRetry = vi.fn();
      render(
        <OpdsCatalogView
          catalog={undefined}
          loading={false}
          error="Connection failed"
          page={1}
          onPageChange={vi.fn()}
          onRetry={onRetry}
        />,
      );

      expect(screen.getByText("Retry")).not.toBeNull();
    });

    it("calls onRetry when retry button is clicked", () => {
      const onRetry = vi.fn();
      render(
        <OpdsCatalogView
          catalog={undefined}
          loading={false}
          error="Connection failed"
          page={1}
          onPageChange={vi.fn()}
          onRetry={onRetry}
        />,
      );

      fireEvent.click(screen.getByText("Retry"));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("does not show retry button when onRetry is not provided", () => {
      render(
        <OpdsCatalogView
          catalog={undefined}
          loading={false}
          error="Connection failed"
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.queryByText("Retry")).toBeNull();
    });
  });

  describe("empty catalog", () => {
    it("shows no catalog message when catalog is undefined", () => {
      render(
        <OpdsCatalogView
          catalog={undefined}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("No Catalog Loaded")).not.toBeNull();
    });

    it("shows empty publications state when catalog has no publications", () => {
      const catalog = createMockCatalog();
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("No Publications Found")).not.toBeNull();
    });
  });

  describe("root navigation links", () => {
    it("renders catalog title as heading", () => {
      const catalog = createMockCatalog({ title: "My OPDS Feed" });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      const heading = screen.getByRole("heading", { level: 2 });
      expect(heading.textContent).toBe("My OPDS Feed");
    });

    it("renders navigation links from catalog.links", () => {
      const catalog = createMockCatalog({
        links: [
          { href: "https://example.com/collections", title: "Collections", rel: "collection" },
          { href: "https://example.com/authors", title: "Authors", rel: "author" },
        ],
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Collections")).not.toBeNull();
      expect(screen.getByText("Authors")).not.toBeNull();
    });

    it("excludes self links from navigation", () => {
      const catalog = createMockCatalog({
        links: [
          { href: "https://example.com/page/1", title: "This Page", rel: "self" },
          { href: "https://example.com/other", title: "Other", rel: "other" },
        ],
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.queryByText("This Page")).toBeNull();
      expect(screen.getByText("Other")).not.toBeNull();
    });

    it("renders updated date", () => {
      const catalog = createMockCatalog({
        updated: "2024-01-15T10:00:00Z",
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText(/Last updated:/)).not.toBeNull();
    });

    it("renders catalog authors", () => {
      const catalog = createMockCatalog({
        authors: ["Jane Doe", "John Smith"],
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("By: Jane Doe, John Smith")).not.toBeNull();
    });
  });

  describe("publication metadata", () => {
    it("renders publication title", () => {
      const catalog = createMockCatalog({
        publications: [createMockPublication({ title: "Dune", authors: ["Frank Herbert"] })],
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Dune")).not.toBeNull();
    });

    it("renders publication authors", () => {
      const catalog = createMockCatalog({
        publications: [
          createMockPublication({ title: "Dune", authors: ["Frank Herbert", "Richard Bachman"] }),
        ],
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Frank Herbert, Richard Bachman")).not.toBeNull();
    });

    it("renders publication series with index", () => {
      const catalog = createMockCatalog({
        publications: [
          createMockPublication({
            title: "Dune Messiah",
            series: { name: "Dune", index: 2 },
          }),
        ],
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("Dune #2")).not.toBeNull();
    });

    it("renders publication description", () => {
      const catalog = createMockCatalog({
        publications: [
          createMockPublication({
            title: "Book with Description",
            descriptions: ["A gripping tale of interstellar politics.", "More details here."],
          }),
        ],
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      const elements = screen.getAllByText(/gripping tale of interstellar politics/);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe("multiple acquisition formats", () => {
    it("renders acquisition format labels", () => {
      const catalog = createMockCatalog({
        publications: [
          createMockPublication({
            title: "Test Book",
            links: [
              { href: "https://example.com/book.epub", media_type: "application/epub+zip" },
              { href: "https://example.com/book.pdf", media_type: "application/pdf" },
            ],
          }),
        ],
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("EPUB")).not.toBeNull();
      expect(screen.getByText("PDF")).not.toBeNull();
    });

    it("renders unknown media types as badges with full type name", () => {
      const catalog = createMockCatalog({
        publications: [
          createMockPublication({
            title: "Custom Format Book",
            links: [
              {
                href: "https://example.com/book.custom",
                media_type: "application/x-custom-format",
              },
            ],
          }),
        ],
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByText("application/x-custom-format")).not.toBeNull();
    });

    it("does not render format badges when no media types", () => {
      const catalog = createMockCatalog({
        publications: [
          createMockPublication({
            title: "No Formats Book",
            links: [],
          }),
        ],
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.queryByText("EPUB")).toBeNull();
    });
  });

  describe("pagination", () => {
    it("renders pagination controls when pagination exists", () => {
      const catalog = createMockCatalog({
        publications: [createMockPublication()],
        pagination: { page: 1, size: 20, total: 100 },
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      expect(screen.getByRole("navigation", { name: "Pagination" })).not.toBeNull();
      expect(screen.getByText("Previous")).not.toBeNull();
      expect(screen.getByText("Next")).not.toBeNull();
    });

    it("calls onPageChange with previous page", () => {
      const onPageChange = vi.fn();
      const catalog = createMockCatalog({
        publications: [createMockPublication()],
        pagination: { page: 2, size: 20, next: "https://example.com/page/3" },
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={2}
          onPageChange={onPageChange}
        />,
      );

      fireEvent.click(screen.getByText("Previous"));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it("calls onPageChange with next page", () => {
      const onPageChange = vi.fn();
      const catalog = createMockCatalog({
        publications: [createMockPublication()],
        pagination: { page: 1, size: 20, next: "https://example.com/page/2" },
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={onPageChange}
        />,
      );

      fireEvent.click(screen.getByText("Next"));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it("disables previous button on first page", () => {
      const catalog = createMockCatalog({
        publications: [createMockPublication()],
        pagination: { page: 1, size: 20 },
      });
      render(
        <OpdsCatalogView
          catalog={catalog}
          loading={false}
          error={null}
          page={1}
          onPageChange={vi.fn()}
        />,
      );

      const prevBtn = screen.getByText("Previous");
      expect(prevBtn.hasAttribute("disabled")).toBe(true);
    });
  });
});
