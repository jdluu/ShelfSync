import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookCard } from "@/components/library/BookCard";
import type { Book } from "@/types/core";

// Mock lucide-react just in case
vi.mock("lucide-react", () => ({
  Book: () => <div data-testid="book-icon" />,
}));

describe("BookCard", () => {
  afterEach(cleanup);

  const mockBook: Book = {
    id: 1,
    title: "Test Book",
    authors: "Test Author",
    path: "test/path",
    series: "Test Series",
    series_index: 2,
    formats: ["epub", "pdf"],
    read_status: "unread",
  };

  it("renders local variant correctly", () => {
    render(<BookCard book={mockBook} variant="local" onToggleStatus={vi.fn()} />);

    expect(screen.getByText("Test Book")).toBeDefined();
    expect(screen.getByText("Test Author")).toBeDefined();
    expect(screen.getByText("Test Series #2")).toBeDefined();
    expect(screen.getByText("Downloaded")).toBeDefined();
    // Default status for local
    expect(screen.getByText("unread")).toBeDefined();
  });

  it("fires action callbacks on remote variant", () => {
    const handleAction = vi.fn();
    render(
      <BookCard book={mockBook} variant="remote" onAction={handleAction} actionLabel="Download" />,
    );

    const button = screen.getByText("Download");
    fireEvent.click(button);
    expect(handleAction).toHaveBeenCalledWith(mockBook);
  });

  it("toggles selectable state via click", () => {
    const handleSelect = vi.fn();
    render(<BookCard book={mockBook} variant="local" selectable={true} onSelect={handleSelect} />);

    const selectButton = screen.getByLabelText(`Select ${mockBook.title}`);
    fireEvent.click(selectButton);

    expect(handleSelect).toHaveBeenCalled();
  });

  it("shows progress bar when downloading", () => {
    render(
      <BookCard
        book={mockBook}
        variant="remote"
        syncStatus={{ status: "downloading", progress: 0.5 }}
      />,
    );

    const progress = screen.getByRole("progressbar");
    expect(progress.getAttribute("value")).toBe("50");
  });
});
