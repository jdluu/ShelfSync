import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpdsPublicationCard } from "@/features/opds/OpdsPublicationCard";
import type { CategorizedLibraryRecord, PublicationLibraryInfo } from "@/types/offline";
import type { Publication } from "@/types/opds";

const createMockPublication = (overrides?: Partial<Publication>): Publication => {
  return {
    id: "book-1",
    title: "Dune",
    authors: [],
    languages: [],
    categories: [],
    relations: [],
    descriptions: [],
    links: [{ href: "https://example.com/book.epub", media_type: "application/epub+zip" }],
    identifiers: {},
    ...overrides,
  };
};

const baseRecord = {
  publication_id: 1,
  account_id: 1,
  provider: "grimmory",
  canonical_id: "book-1",
  metadata_json: "{}",
  publication_available: true,
  acquisition_id: 1,
  media_type: "application/epub+zip",
  canonical_url: "https://example.com/download/book-1.epub",
  revision_id: 11,
  is_current_revision: true,
  local_relative_path: "Dune.epub",
  expected_length: null,
  job_state: "completed" as const,
  job_error: null as string | null,
  updated_at: 0,
};

const libraryInfo = (
  primary: CategorizedLibraryRecord | null,
  superseded: CategorizedLibraryRecord[] = [],
): PublicationLibraryInfo => ({ primary, superseded });

describe("OpdsPublicationCard action buttons (Button primitive migration)", () => {
  afterEach(cleanup);

  describe("Download button", () => {
    const renderWithSelectedFormat = (
      props: Partial<Parameters<typeof OpdsPublicationCard>[0]> = {},
    ) => {
      render(
        <OpdsPublicationCard
          publication={createMockPublication()}
          catalogUrl="https://example.com/opds"
          contentRoot="/content"
          onDownload={vi.fn()}
          {...props}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Select download format" }));
      fireEvent.click(screen.getByRole("option", { name: "EPUB" }));
      return screen.getByRole("button", { name: "Download Dune as EPUB" });
    };

    it("renders with the primary variant and sm size classes", () => {
      const button = renderWithSelectedFormat();
      const className = button.getAttribute("class") ?? "";
      expect(className).toContain("btn-primary");
      expect(className).toContain("btn-sm");
      expect(className).toContain("w-full");
    });

    it("keeps the focus ring and cancel-focus classes", () => {
      const button = renderWithSelectedFormat();
      const className = button.getAttribute("class") ?? "";
      expect(className).toContain("focus-visible:ring-2");
      expect(className).toContain("outline-none");
    });

    it("keeps its exact aria-label and label text", () => {
      expect(renderWithSelectedFormat().getAttribute("aria-label")).toBe("Download Dune as EPUB");
      expect(screen.getByText("Download")).not.toBeNull();
    });
  });

  describe("Delete local button", () => {
    const renderDelete = (overrides: Partial<Parameters<typeof OpdsPublicationCard>[0]> = {}) =>
      render(
        <OpdsPublicationCard
          publication={createMockPublication()}
          libraryInfo={libraryInfo({ ...baseRecord, section: "complete" })}
          onDeleteLocal={vi.fn()}
          {...overrides}
        />,
      );

    it("renders with the ghost variant and sm size classes", () => {
      renderDelete();
      const button = screen.getByRole("button", { name: "Delete local copy of Dune" });
      const className = button.getAttribute("class") ?? "";
      expect(className).toContain("btn-ghost");
      expect(className).toContain("btn-sm");
      expect(className).toContain("focus-visible:ring-2");
    });

    it("disables and shows Deleting label while the matching revision is deleting", () => {
      renderDelete({ deletingRevisionId: baseRecord.revision_id });
      const button = screen.getByRole("button", { name: "Delete local copy of Dune" });
      expect(button.hasAttribute("disabled")).toBe(true);
      expect(screen.getByText("Deleting...")).not.toBeNull();
    });

    it("keeps the exact aria-label and invokes the callback", () => {
      const onDeleteLocal = vi.fn();
      renderDelete({ onDeleteLocal });
      const button = screen.getByRole("button", { name: "Delete local copy of Dune" });
      fireEvent.click(button);
      expect(onDeleteLocal).toHaveBeenCalledWith({ ...baseRecord, section: "complete" });
    });
  });

  describe("Retry download button", () => {
    const renderRetry = (overrides: Partial<Parameters<typeof OpdsPublicationCard>[0]> = {}) =>
      render(
        <OpdsPublicationCard
          publication={createMockPublication()}
          catalogUrl="https://example.com/opds"
          contentRoot="/content"
          onDownload={vi.fn()}
          libraryInfo={libraryInfo({
            ...baseRecord,
            section: "failed",
            job_state: "failed",
            job_error: "Checksum verification failed (sha256)",
            local_relative_path: null,
          })}
          {...overrides}
        />,
      );

    it("renders with the danger variant and sm size classes", () => {
      renderRetry();
      const button = screen.getByRole("button", { name: "Retry download of Dune" });
      const className = button.getAttribute("class") ?? "";
      expect(className).toContain("btn-error");
      expect(className).toContain("btn-sm");
      expect(className).toContain("w-full");
      expect(className).toContain("focus-visible:ring-2");
    });

    it("disables the retry button while busy downloading", () => {
      renderRetry({ downloadStatus: "downloading" });
      const button = screen.getByRole("button", { name: "Retry download of Dune" });
      expect(button.hasAttribute("disabled")).toBe(true);
    });

    it("keeps the exact aria-label and invokes the retry callback", () => {
      const onDownload = vi
        .fn()
        .mockResolvedValue({ localPath: "/x/Dune.epub", mediaType: "application/epub+zip" });
      renderRetry({ onDownload });
      const button = screen.getByRole("button", { name: "Retry download of Dune" });
      expect(button.getAttribute("aria-label")).toBe("Retry download of Dune");
      fireEvent.click(button);
      expect(onDownload).toHaveBeenCalledTimes(1);
    });
  });
});
