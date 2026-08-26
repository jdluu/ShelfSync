import { describe, expect, it } from "vitest";
import type { Acquisition, Publication } from "@/types/opds";
import {
  findAcquisitionLinkForFormat,
  getAcquisitionLinks,
  getDownloadableFormats,
  hasDownloadableFormats,
  isAcquisitionLink,
} from "@/types/opds";

const link = (overrides: Partial<Acquisition>): Acquisition => ({
  href: "/book.epub",
  ...overrides,
});

const publicationWith = (links: Acquisition[]): Publication => ({
  id: "pub-1",
  title: "Dune",
  authors: [],
  languages: [],
  categories: [],
  relations: [],
  descriptions: [],
  identifiers: {},
  links,
});

describe("isAcquisitionLink", () => {
  it("treats missing rel as acquisition", () => {
    expect(isAcquisitionLink(link({ href: "/a", rel: null }))).toBe(true);
    expect(isAcquisitionLink({ href: "/a" })).toBe(true);
  });

  it("accepts generic and OPDS acquisition rels including subtypes", () => {
    expect(isAcquisitionLink(link({ rel: "acquisition" }))).toBe(true);
    expect(isAcquisitionLink(link({ rel: "http://opds-spec.org/acquisition" }))).toBe(true);
    expect(isAcquisitionLink(link({ rel: "http://opds-spec.org/acquisition/open-access" }))).toBe(
      true,
    );
  });

  it("rejects unrelated rels", () => {
    expect(isAcquisitionLink(link({ rel: "subsection" }))).toBe(false);
    expect(isAcquisitionLink(link({ rel: "http://opds-spec.org/image" }))).toBe(false);
  });
});

describe("getAcquisitionLinks", () => {
  it("keeps catalog order and drops non-acquisition links", () => {
    const links = [
      link({ href: "/cover.png", rel: "http://opds-spec.org/image", type: "image/png" }),
      link({ href: "/first.epub", media_type: "application/epub+zip" }),
      link({ href: "/page.html", rel: "alternate" }),
      link({ href: "/second.pdf", media_type: "application/pdf" }),
    ];
    const result = getAcquisitionLinks(publicationWith(links));
    expect(result.map((l) => l.href)).toEqual(["/first.epub", "/second.pdf"]);
  });

  it("returns empty for a publication without links", () => {
    const publication = publicationWith([]);
    publication.links = undefined as unknown as Acquisition[];
    expect(getAcquisitionLinks(publication)).toEqual([]);
  });
});

describe("getDownloadableFormats / hasDownloadableFormats", () => {
  it("collects EPUB and PDF links in order with hrefs", () => {
    const formats = getDownloadableFormats(
      publicationWith([
        link({ href: "/a.pdf", media_type: "application/pdf" }),
        link({ href: "/b.epub", media_type: "application/epub+zip" }),
        link({ href: "/c.txt", media_type: "text/html" }),
        link({ href: "/no-type" }),
      ]),
    );
    expect(formats).toEqual([
      { href: "/a.pdf", mediaType: "application/pdf" },
      { href: "/b.epub", mediaType: "application/epub+zip" },
    ]);
    expect(hasDownloadableFormats(publicationWith([]))).toBe(false);
    expect(
      hasDownloadableFormats(
        publicationWith([link({ href: "/b.epub", media_type: "application/epub+zip" })]),
      ),
    ).toBe(true);
  });
});

describe("findAcquisitionLinkForFormat", () => {
  const publication = publicationWith([
    link({ href: "/book.pdf", media_type: "application/pdf" }),
    link({ href: "/book.epub", media_type: "application/epub+zip" }),
  ]);

  it("prefers the link matching the requested format exactly", () => {
    expect(findAcquisitionLinkForFormat(publication, "application/pdf")?.href).toBe("/book.pdf");
    expect(findAcquisitionLinkForFormat(publication, "application/epub+zip")?.href).toBe(
      "/book.epub",
    );
  });

  it("falls back to the first EPUB link when the format has no dedicated link", () => {
    const epubOnly = publicationWith([
      link({ href: "/only.epub", media_type: "application/epub+zip" }),
    ]);
    expect(findAcquisitionLinkForFormat(epubOnly, "application/pdf")?.href).toBe("/only.epub");
  });

  it("returns null when nothing matches", () => {
    const htmlOnly = publicationWith([link({ href: "/p.html", media_type: "text/html" })]);
    expect(findAcquisitionLinkForFormat(htmlOnly, "application/epub+zip")).toBeNull();
  });
});
