export interface NavigationLink {
  href: string;
  rel?: string | null;
  title?: string | null;
  type?: string | null;
}

export interface Series {
  name: string;
  index?: number | null;
}

export interface Relation {
  rel: string;
  href: string;
}

export interface AcquisitionCost {
  price?: number | null;
  currency?: string | null;
  description?: string | null;
}

export interface Acquisition {
  href: string;
  type?: string | null;
  media_type?: string | null;
  cost?: AcquisitionCost | null;
  rel?: string | null;
}

export interface RepresentativeLink {
  href: string;
  type?: string | null;
}

export interface Publication {
  id: string;
  updated?: string | null;
  title: string;
  authors: string[];
  pubdate?: string | null;
  publisher?: string | null;
  identifiers: Record<string, string>;
  series?: Series | null;
  languages: string[];
  categories: string[];
  relations: Relation[];
  descriptions: string[];
  links: Acquisition[];
  providers?: string[] | null;
  representative?: RepresentativeLink | null;
}

export interface Pagination {
  page: number;
  size: number;
  total?: number | null;
  next?: string | null;
}

export interface Catalog {
  title: string;
  updated?: string | null;
  authors: string[];
  links: NavigationLink[];
  publications: Publication[];
  pagination?: Pagination | null;
}

export interface FetchOpdsCatalogParams {
  url: string;
  username: string;
  password: string;
  page?: number | null;
  page_size?: number | null;
}

export type MediaType = "application/epub+zip" | "application/pdf" | string;

export interface DownloadConfig {
  catalogUrl: string;
  transientUsername?: string;
  transientPassword?: string;
  contentRoot: string;
}

export interface DownloadProgress {
  publicationId: string;
  bytesReceived: number;
  totalBytes: number | null;
  status: "starting" | "downloading" | "completed" | "failed";
  error?: string;
}

export type DownloadStatus = "idle" | "downloading" | "completed" | "failed";

export interface DownloadResult {
  localPath: string;
  mediaType: MediaType;
}

export type AcquisitionFormat = {
  href: string;
  mediaType: MediaType;
};

const EPUB_MEDIA_TYPE: MediaType = "application/epub+zip";
const ACQUISITION_REL = "http://opds-spec.org/acquisition";

/**
 * Single source for acquisition-link selection ("which link do I download").
 *
 * All format scanning across cards, modals, and services must go through
 * these helpers so catalog-order and fallback semantics stay consistent.
 */

/** A link counts as an acquisition when its rel is missing, generic, or an OPDS acquisition rel. */
export function isAcquisitionLink(link: Acquisition): boolean {
  return !link.rel || link.rel === "acquisition" || link.rel.startsWith(ACQUISITION_REL);
}

/** Acquisition links of a publication, in catalog order. */
export function getAcquisitionLinks(publication: Publication): Acquisition[] {
  return (publication.links ?? []).filter(isAcquisitionLink);
}

/**
 * Downloadable formats offered by a publication: acquisition links with an
 * explicit EPUB or PDF media type, in catalog order.
 */
export function getDownloadableFormats(publication: Publication): AcquisitionFormat[] {
  const formats: AcquisitionFormat[] = [];
  for (const link of publication.links ?? []) {
    if (link.media_type === EPUB_MEDIA_TYPE || link.media_type === "application/pdf") {
      formats.push({ href: link.href, mediaType: link.media_type });
    }
  }
  return formats;
}

/** Whether any link of the publication is downloadable (EPUB/PDF). */
export function hasDownloadableFormats(publication: Publication): boolean {
  return getDownloadableFormats(publication).length > 0;
}

/**
 * Pick the acquisition link to download for the requested format. Falls back
 * to the first EPUB link when no dedicated link matches, mirroring the
 * downloader's historical behavior.
 */
export function findAcquisitionLinkForFormat(
  publication: Publication,
  format: MediaType,
): Acquisition | null {
  return (
    (publication.links ?? []).find(
      (link) => link.media_type === format || link.media_type === EPUB_MEDIA_TYPE,
    ) ?? null
  );
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  "application/epub+zip": "EPUB",
  "application/pdf": "PDF",
  "application/pdf+aes": "PDF (Encrypted)",
  "application/zip": "ZIP",
  "chemical/x-mdldrum": "MDL",
  "chemical/x-mol": "MOL",
  "text/html": "HTML",
  "application/rtf": "RTF",
  "application/x-mobipocket-ebook": "MOBI",
  "application/x-kindle": "Kindle",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
};

/**
 * Single source for display labels shown next to media types (badges, format
 * menus, download buttons). Falls back to the raw media type for unknown
 * formats and matches case-insensitively.
 */
export function getMediaTypeDisplayLabel(mediaType: string): string {
  return MEDIA_TYPE_LABELS[mediaType.toLowerCase()] || mediaType;
}

/**
 * Normalize an acquisition link into its download format, preferring
 * `media_type` over `type` and defaulting to EPUB when neither is present.
 */
export function getAcquisitionMediaType(link: Acquisition): MediaType {
  return link.media_type ?? link.type ?? EPUB_MEDIA_TYPE;
}
