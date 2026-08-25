import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LibraryStateBadge,
  librarySectionLabel,
} from "@/features/opds/LibraryStateBadge";
import { OpdsPublicationCard } from "@/features/opds/OpdsPublicationCard";
import type {
  CategorizedLibraryRecord,
  PublicationLibraryInfo,
} from "@/types/offline";
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
    links: [
      { href: "/download/book-1.epub", media_type: "application/epub+zip" },
    ],
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

describe("LibraryStateBadge", () => {
  afterEach(cleanup);

  it.each([
    ["complete", "Downloaded"],
    ["downloading", "Downloading"],
    ["failed", "Download failed"],
    ["unavailable", "Removed from server"],
    ["superseded", "Older copy"],
  ] as const)("%s record renders a %s label", (section, label) => {
    render(<LibraryStateBadge record={{ ...baseRecord, section }} />);
    expect(screen.getByText(label)).not.toBeNull();
  });

  it("exposes human readable labels for every section", () => {
    for (const section of [
      "complete",
      "downloading",
      "failed",
      "unavailable",
      "superseded",
    ] as const) {
      expect(librarySectionLabel(section).length).toBeGreaterThan(0);
    }
  });
});

describe("OpdsPublicationCard offline library states", () => {
  afterEach(cleanup);

  const libraryInfo = (
    primary: CategorizedLibraryRecord | null,
    superseded: CategorizedLibraryRecord[] = [],
  ): PublicationLibraryInfo => ({ primary, superseded });

  it("shows a downloaded badge and delete action for complete records", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication()}
        libraryInfo={libraryInfo({ ...baseRecord, section: "complete" })}
        onDeleteLocal={vi.fn()}
      />,
    );

    expect(screen.getByText("Downloaded")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Delete local copy of Dune" })).not.toBeNull();
  });

  it("shows unavailable badge with kept-local hint and delete action", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication()}
        libraryInfo={libraryInfo({
          ...baseRecord,
          section: "unavailable",
          publication_available: false,
        })}
        onDeleteLocal={vi.fn()}
      />,
    );

    expect(screen.getByText("Removed from server")).not.toBeNull();
    expect(screen.getByText("local copy kept on device")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Delete local copy of Dune" }),
    ).not.toBeNull();
  });

  it("shows retry action for failed records", async () => {
    const onDownload = vi
      .fn()
      .mockResolvedValue({ localPath: "/x/Dune.epub", mediaType: "application/epub+zip" });
    render(
      <OpdsPublicationCard
        publication={createMockPublication()}
        catalogUrl="https://example.com/opds"
        contentRoot="/content"
        onDownload={onDownload}
        libraryInfo={libraryInfo({
          ...baseRecord,
          section: "failed",
          job_state: "failed",
          job_error: "Checksum verification failed (sha256)",
          local_relative_path: null,
        })}
      />,
    );

    expect(screen.getByText("Download failed")).not.toBeNull();
    expect(screen.getByText(/Checksum verification failed/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry download of Dune" }));
    await waitFor(() => {
      expect(onDownload).toHaveBeenCalledTimes(1);
      expect(onDownload.mock.calls[0]?.[2]).toBe("application/epub+zip");
    });
  });

  it("offers separate deletion for superseded copies", async () => {
    const onDeleteLocal = vi.fn();
    const superseded: CategorizedLibraryRecord = {
      ...baseRecord,
      section: "superseded",
      is_current_revision: false,
      revision_id: 3,
      job_state: "completed",
    };
    render(
      <OpdsPublicationCard
        publication={createMockPublication()}
        libraryInfo={libraryInfo({ ...baseRecord, section: "complete" }, [superseded])}
        onDeleteLocal={onDeleteLocal}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Delete older EPUB copy of Dune",
    });
    fireEvent.click(button);
    await waitFor(() => {
      expect(onDeleteLocal).toHaveBeenCalledWith(superseded);
    });
  });

  it("does not offer delete when no local file exists", () => {
    render(
      <OpdsPublicationCard
        publication={createMockPublication()}
        libraryInfo={libraryInfo({ ...baseRecord, section: "complete", local_relative_path: null })}
        onDeleteLocal={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Delete local copy/ })).toBeNull();
  });
});
