import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OpdsPublicationCard } from "@/features/opds/OpdsPublicationCard";
import type { Publication } from "@/types/opds";

const createMockPublication = (overrides?: Partial<Publication>): Publication => {
  return {
    id: "pub-1",
    title: "Test Publication",
    authors: ["Test Author"],
    languages: ["en"],
    relations: [],
    descriptions: ["A test publication description"],
    links: [],
    identifiers: {},
    ...overrides,
  };
};

describe("OpdsPublicationCard", () => {
  afterEach(cleanup);

  it("renders publication title", () => {
    render(<OpdsPublicationCard publication={createMockPublication({ title: "Dune" })} />);

    expect(screen.getByText("Dune")).not.toBeNull();
  });

  it("renders publication authors", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Dune",
          authors: ["Frank Herbert", "Brian Herbert"],
        })}
      />,
    );

    expect(screen.getByText("Frank Herbert, Brian Herbert")).not.toBeNull();
  });

  it("renders series information", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Dune Messiah",
          series: { name: "Dune", index: 2 },
        })}
      />,
    );

    expect(screen.getByText("Dune #2")).not.toBeNull();
  });

  it("renders series without index", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Standalone Book",
          series: { name: "Trilogy", index: null },
        })}
      />,
    );

    expect(screen.getByText("Trilogy")).not.toBeNull();
  });

  it("renders description", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Book with Description",
          descriptions: ["This is a detailed description of the book."],
        })}
      />,
    );

    expect(screen.getByText("This is a detailed description of the book.")).not.toBeNull();
  });

  it("renders acquisition formats as badges", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Format Test Book",
          links: [
            { href: "https://example.com/book.epub", media_type: "application/epub+zip" },
            { href: "https://example.com/book.pdf", media_type: "application/pdf" },
          ],
        })}
      />,
    );

    expect(screen.getByText("EPUB")).not.toBeNull();
    expect(screen.getByText("PDF")).not.toBeNull();
  });

  it("renders unknown media types as badges with full type name", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Custom Format Book",
          links: [
            { href: "https://example.com/book.custom", media_type: "application/x-custom-format" },
          ],
        })}
      />,
    );

    expect(screen.getByText("application/x-custom-format")).not.toBeNull();
  });

  it("does not render format badges when showFormats is false", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
        })}
        showFormats={false}
      />,
    );

    expect(screen.queryByText("EPUB")).toBeNull();
  });

  it("does not render format badges when no media types", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "No Formats Book",
          links: [],
        })}
      />,
    );

    expect(screen.queryByText("EPUB")).toBeNull();
  });

  it("renders book icon when no cover is provided", () => {
    render(<OpdsPublicationCard publication={createMockPublication()} />);

    const svg = document.querySelector(".lucide-book");
    expect(svg).not.toBeNull();
  });

  it("renders image when cover is provided", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          representative: { href: "https://example.com/cover.jpg" },
        })}
      />,
    );

    const img = document.querySelector('img[alt="Cover of Test Publication"]');
    expect(img).not.toBeNull();
  });

  it("has proper accessibility attributes", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Accessible Book",
          authors: ["Test Author"],
          links: [],
        })}
      />,
    );

    const article = document.querySelector('article[aria-labelledby="pub-title-pub-1"]');
    expect(article).not.toBeNull();
  });
});
