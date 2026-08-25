import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublicationDetailModal } from "@/features/opds/PublicationDetailModal";
import type { Publication } from "@/types/opds";

vi.mock("@/utils/tauri", () => ({
  isTauri: () => false,
  safeInvoke: vi.fn(),
  safeStoreLoad: vi.fn(),
}));

const makePublication = (overrides: Partial<Publication> = {}): Publication => ({
  id: "urn:book:1",
  title: "Blackflame",
  authors: ["Will Wight"],
  pubdate: "2017-04-18",
  publisher: "Hidden Gnome Publishing",
  identifiers: {},
  series: { name: "Cradle", index: 3 },
  languages: ["en"],
  categories: ["Fantasy", "Adventure"],
  relations: [],
  descriptions: ["<p>Lindon has a year left.</p>"],
  links: [
    {
      href: "/download/934",
      media_type: "application/epub+zip",
      rel: "http://opds-spec.org/acquisition",
    },
  ],
  representative: { href: "/cover/934", type: "image/jpeg" },
  ...overrides,
});

describe("PublicationDetailModal", () => {
  it("shows synopsis, year, author, publisher, series, and categories", () => {
    render(<PublicationDetailModal publication={makePublication()} onClose={() => {}} />);
    expect(screen.getByText("Blackflame")).toBeTruthy();
    expect(screen.getByText("Will Wight")).toBeTruthy();
    expect(screen.getByText("Hidden Gnome Publishing")).toBeTruthy();
    expect(screen.getByText("2017")).toBeTruthy();
    expect(screen.getByText(/Cradle/)).toBeTruthy();
    expect(screen.getByText("Fantasy")).toBeTruthy();
    expect(screen.getByText(/Lindon has a year left\./)).toBeTruthy();
  });

  it("strips HTML from the synopsis", () => {
    render(<PublicationDetailModal publication={makePublication()} onClose={() => {}} />);
    expect(screen.queryByText("<p>Lindon has a year left.</p>")).toBeNull();
  });

  it("renders a download button per acquisition format and calls onDownload", async () => {
    const onDownload = vi
      .fn()
      .mockResolvedValue({ localPath: "/x.epub", mediaType: "application/epub+zip" });
    render(
      <PublicationDetailModal
        publication={makePublication()}
        onClose={() => {}}
        catalogUrl="http://localhost:6061/api/v1/opds"
        contentRoot="ShelfSync"
        onDownload={onDownload}
      />,
    );
    const btn = screen.getByRole("button", { name: /Download Blackflame as EPUB/ });
    fireEvent.click(btn);
    await waitFor(() => expect(onDownload).toHaveBeenCalled());
  });

  it("closes on backdrop click and Escape", () => {
    const onClose = vi.fn();
    const { container } = render(
      <PublicationDetailModal publication={makePublication()} onClose={onClose} />,
    );
    fireEvent.keyDown(container.firstElementChild as HTMLElement, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not crash on minimal publication data", () => {
    render(
      <PublicationDetailModal
        publication={{
          id: "urn:min",
          title: "Minimal",
          authors: [],
          identifiers: {},
          languages: [],
          categories: [],
          relations: [],
          descriptions: [],
          links: [],
        }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Minimal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Download Minimal/ })).toBeNull();
  });
});
