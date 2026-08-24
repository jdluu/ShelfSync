import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookCard } from "@/components/library/BookCard";
import { VirtualGrid } from "@/components/library/VirtualGrid";
import type { Book } from "@/types/core";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

const makeBook = (id: number): Book => ({
  id,
  title: `Book ${id}`,
  authors: `Author ${id}`,
  path: `library/book-${id}`,
});

describe("VirtualGrid a11y", () => {
  afterEach(cleanup);

  it("exposes the collection as a list with listitem children", () => {
    const books = Array.from({ length: 12 }, (_, i) => makeBook(i + 1));
    render(
      <VirtualGrid
        items={books}
        viewMode="grid"
        keyExtractor={(book) => book.id}
        itemComponent={({ item }) => <div>{item.title}</div>}
      />,
    );

    expect(screen.getByRole("list")).toBeDefined();

    const listitems = screen.getAllByRole("listitem");
    expect(listitems).toHaveLength(books.length);
    for (let i = 0; i < books.length; i++) {
      expect(listitems[i]?.textContent).toBe(books[i]?.title);
    }
  });

  it("keeps the same roles in list mode", () => {
    const books = [makeBook(1), makeBook(2)];
    render(
      <VirtualGrid
        items={books}
        viewMode="list"
        keyExtractor={(book) => book.id}
        itemComponent={({ item }) => <div>{item.title}</div>}
      />,
    );

    expect(screen.getByRole("list")).toBeDefined();
    expect(screen.getAllByRole("listitem")).toHaveLength(books.length);
  });
});

describe("BookCard a11y", () => {
  afterEach(cleanup);

  const book = makeBook(7);

  it("has an accessible name combining title and author", () => {
    render(<BookCard book={book} variant="local" />);

    const card = screen.getByRole("article");
    expect(card.getAttribute("aria-label")).toBe("Book 7 by Author 7");
  });

  it("activates selection with Enter and Space when selectable", () => {
    const handleSelect = vi.fn();
    render(
      <BookCard book={book} variant="local" selectable onSelect={handleSelect} />,
    );

    const card = screen.getByRole("article");
    expect(card.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(handleSelect).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(card, { key: "Tab" });
    expect(handleSelect).toHaveBeenCalledTimes(2);
  });

  it("ignores keys pressed inside nested controls", () => {
    const handleSelect = vi.fn();
    render(
      <BookCard
        book={book}
        variant="remote"
        selectable
        onSelect={handleSelect}
        onAction={vi.fn()}
        actionLabel="Sync"
      />,
    );

    fireEvent.keyDown(screen.getByText("Sync"), { key: "Enter" });
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it("is not focusable when selection is disabled", () => {
    render(<BookCard book={book} variant="local" />);

    expect(screen.getByRole("article").getAttribute("tabindex")).toBeNull();
  });

  it("gives the cover image meaningful alt text", () => {
    render(
      <BookCard book={{ ...book, cover_url: "/covers/book-7.jpg" }} variant="local" />,
    );

    expect(screen.getByAltText(`Cover of ${book.title}`)).toBeDefined();
  });
});
