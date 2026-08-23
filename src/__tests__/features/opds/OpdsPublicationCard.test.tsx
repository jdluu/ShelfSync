import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("OpdsPublicationCard with download props", () => {
  afterEach(cleanup);

  it("does not show download buttons without download callback", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [
            { href: "https://example.com/book.epub", media_type: "application/epub+zip" },
            { href: "https://example.com/book.pdf", media_type: "application/pdf" },
          ],
        })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
      />,
    );

    expect(screen.queryByText("Download")).toBeNull();
    expect(screen.queryByText("Select Format")).toBeNull();
  });

  it("does not show download buttons without all config", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
        })}
        catalogUrl="https://example.com/opds"
      />,
    );

    expect(screen.queryByText("Download")).toBeNull();
  });

  it("shows download section when onDownload callback is provided", () => {
    const onDownload = vi.fn();

    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
        })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        onDownload={onDownload}
      />,
    );

    const button = screen.getByRole("button", { name: "Select download format" });
    expect(button).not.toBeNull();
  });

  it("shows format selection dropdown", () => {
    const onDownload = vi.fn();

    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [
            { href: "https://example.com/book.epub", media_type: "application/epub+zip" },
            { href: "https://example.com/book.pdf", media_type: "application/pdf" },
          ],
        })}
        catalogUrl="https://example.com/opds"
        transientUsername="user"
        transientPassword="pass"
        contentRoot="/content"
        onDownload={onDownload}
      />,
    );

    const formatButton = screen.getByRole("button", { name: "Select download format" });
    expect(formatButton).not.toBeNull();
  });

  it("shows EPUB and PDF options when clicked", () => {
    const onDownload = vi.fn();

    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [
            { href: "https://example.com/book.epub", media_type: "application/epub+zip" },
            { href: "https://example.com/book.pdf", media_type: "application/pdf" },
          ],
        })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select download format" }));

    expect(screen.getByRole("option", { name: "EPUB" })).not.toBeNull();
    expect(screen.getByRole("option", { name: "PDF" })).not.toBeNull();
  });

  it("shows download button after format selection", () => {
    const onDownload = vi.fn();

    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
        })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select download format" }));
    fireEvent.click(screen.getByRole("option", { name: "EPUB" }));

    expect(screen.getByRole("button", { name: "Download as EPUB" })).not.toBeNull();
  });

  it("calls onDownload when download button clicked", async () => {
    const onDownload = vi
      .fn()
      .mockResolvedValue({ localPath: "/path/book.epub", mediaType: "application/epub+zip" });

    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
        })}
        catalogUrl="https://example.com/opds"
        transientUsername="user"
        transientPassword="pass"
        contentRoot="/content"
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select download format" }));
    fireEvent.click(screen.getByRole("option", { name: "EPUB" }));
    fireEvent.click(screen.getByRole("button", { name: "Download as EPUB" }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onDownload).toHaveBeenCalled();
  });

  it("shows downloading status during download", () => {
    const onDownload = vi.fn();

    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
        })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        onDownload={onDownload}
        downloadStatus="downloading"
      />,
    );

    const button = screen.getByRole("button", { name: "Select download format" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("shows completed status with download path", () => {
    const onDownload = vi.fn();
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
        })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        onDownload={onDownload}
        downloadStatus="completed"
        downloadLocalPath="/content/Test_Book.epub"
      />,
    );

    expect(screen.getByText("Downloaded")).not.toBeNull();
    expect(screen.getByText(/Test_Book\.epub/i)).not.toBeNull();
  });

  it("shows failed status with error message", () => {
    const onDownload = vi.fn();
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
        })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        onDownload={onDownload}
        downloadStatus="failed"
        downloadErrorMessage="Download failed: Network error"
      />,
    );

    expect(screen.getByText(/download failed/i)).not.toBeNull();
    expect(screen.getByText(/Network error/i)).not.toBeNull();
    const button = screen.getByRole("button", { name: "Select download format" });
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("preserves existing format tags when download props absent", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [
            { href: "https://example.com/book.epub", media_type: "application/epub+zip" },
            { href: "https://example.com/book.pdf", media_type: "application/pdf" },
          ],
        })}
      />,
    );

    expect(screen.getByText("EPUB")).not.toBeNull();
    expect(screen.getByText("PDF")).not.toBeNull();
    expect(screen.getByRole("list", { name: /available formats/i })).not.toBeNull();
  });

  it("has accessible labels for download status", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Test Book",
          links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
        })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        downloadStatus="downloading"
      />,
    );

    expect(screen.getByText("Download status: downloading")).not.toBeNull();
  });
});

describe("OpdsPublicationCard download progress", () => {
  afterEach(cleanup);

  const renderDownloadingCard = (downloadProgress?: number | null) =>
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Progress Book",
          links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
        })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        onDownload={vi.fn()}
        downloadStatus="downloading"
        downloadProgress={downloadProgress ?? null}
      />,
    );

  it("renders a determinate progress bar with percent when total size is known", () => {
    renderDownloadingCard(42);

    const progressBar = screen.getByRole("progressbar", { name: "Downloading Progress Book" });
    expect(progressBar.getAttribute("value")).toBe("42");
    expect(progressBar.getAttribute("max")).toBe("100");
    expect(screen.getByText("42%")).not.toBeNull();
  });

  it("renders an indeterminate progress bar without percent when total size is unknown", () => {
    renderDownloadingCard(null);

    const progressBar = screen.getByRole("progressbar", { name: "Downloading Progress Book" });
    expect(progressBar.hasAttribute("value")).toBe(false);
    expect(screen.queryByText(/%\s*$/)).toBeNull();
    expect(screen.getByText("Downloading…")).not.toBeNull();
  });

  it("does not render a progress bar when not downloading", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({ title: "Idle Book" })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        onDownload={vi.fn()}
        downloadStatus="completed"
        downloadLocalPath="/content/idle.epub"
        downloadProgress={50}
      />,
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("50%")).toBeNull();
  });
});

describe("OpdsPublicationCard format dropdown dismissal", () => {
  afterEach(cleanup);

  const renderCardWithMenu = () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication({
          title: "Dropdown Book",
          links: [
            { href: "https://example.com/book.epub", media_type: "application/epub+zip" },
            { href: "https://example.com/book.pdf", media_type: "application/pdf" },
          ],
        })}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        onDownload={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select download format" }));
  };

  it("closes the format menu when Escape is pressed", () => {
    renderCardWithMenu();
    expect(screen.getByRole("option", { name: "EPUB" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("option", { name: "EPUB" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "Select download format" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the format menu on click outside", () => {
    renderCardWithMenu();
    expect(screen.getByRole("option", { name: "PDF" })).not.toBeNull();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("option", { name: "PDF" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "Select download format" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the format menu open when clicking inside the card menu area", () => {
    renderCardWithMenu();

    fireEvent.mouseDown(screen.getByRole("option", { name: "EPUB" }));

    expect(screen.getByRole("option", { name: "EPUB" })).not.toBeNull();
  });

  it("stops listening after the menu closes so Escape no longer affects it", () => {
    renderCardWithMenu();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("option", { name: "EPUB" })).toBeNull();

    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow();
    expect(screen.getByRole("button", { name: "Select download format" })).not.toBeNull();
  });

  it("still selects a format with full mouse sequence (mousedown then click)", () => {
    renderCardWithMenu();

    const option = screen.getByRole("option", { name: "EPUB" });
    fireEvent.mouseDown(option);
    fireEvent.click(option);

    expect(screen.getByRole("button", { name: "Download as EPUB" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "EPUB" })).toBeNull();
  });
});
