/**
 * Extensible registry for media types, display labels, and downloadable formats.
 * Follows the Open-Closed Principle (OCP): open for format extensions without
 * modifying existing download pipeline code.
 */

export interface FormatDefinition {
  mediaType: string;
  label: string;
  extension: string;
  downloadable: boolean;
}

const DEFAULT_FORMATS: FormatDefinition[] = [
  {
    mediaType: "application/epub+zip",
    label: "EPUB",
    extension: ".epub",
    downloadable: true,
  },
  {
    mediaType: "application/pdf",
    label: "PDF",
    extension: ".pdf",
    downloadable: true,
  },
  {
    mediaType: "application/pdf+aes",
    label: "PDF (Encrypted)",
    extension: ".pdf",
    downloadable: false,
  },
  {
    mediaType: "application/zip",
    label: "ZIP",
    extension: ".zip",
    downloadable: false,
  },
  {
    mediaType: "application/x-mobipocket-ebook",
    label: "MOBI",
    extension: ".mobi",
    downloadable: false,
  },
  {
    mediaType: "application/x-kindle",
    label: "Kindle",
    extension: ".azw3",
    downloadable: false,
  },
  {
    mediaType: "text/html",
    label: "HTML",
    extension: ".html",
    downloadable: false,
  },
  {
    mediaType: "application/rtf",
    label: "RTF",
    extension: ".rtf",
    downloadable: false,
  },
  {
    mediaType: "image/jpeg",
    label: "JPEG",
    extension: ".jpg",
    downloadable: false,
  },
  {
    mediaType: "image/png",
    label: "PNG",
    extension: ".png",
    downloadable: false,
  },
];

class FormatRegistry {
  private formats = new Map<string, FormatDefinition>();

  constructor(initialFormats: FormatDefinition[] = DEFAULT_FORMATS) {
    for (const fmt of initialFormats) {
      this.formats.set(fmt.mediaType.toLowerCase(), fmt);
    }
  }

  /**
   * Registers or updates a format definition.
   */
  public registerFormat(def: FormatDefinition): void {
    this.formats.set(def.mediaType.toLowerCase(), def);
  }

  /**
   * Checks whether a media type is configured as downloadable by the application.
   */
  public isDownloadable(mediaType: unknown): boolean {
    if (!mediaType || typeof mediaType !== "string") return false;
    const def = this.formats.get(mediaType.toLowerCase());
    return def ? def.downloadable : false;
  }

  /**
   * Retrieves the human-readable display label for a media type.
   */
  public getLabel(mediaType: unknown): string {
    if (!mediaType || typeof mediaType !== "string") return "Unknown";
    const def = this.formats.get(mediaType.toLowerCase());
    return def ? def.label : mediaType;
  }

  /**
   * Returns all formats currently marked as downloadable.
   */
  public getDownloadableFormats(): FormatDefinition[] {
    return Array.from(this.formats.values()).filter((fmt) => fmt.downloadable);
  }

  /**
   * Resets the registry to initial defaults. Useful for test cleanup.
   */
  public reset(): void {
    this.formats.clear();
    for (const fmt of DEFAULT_FORMATS) {
      this.formats.set(fmt.mediaType.toLowerCase(), fmt);
    }
  }
}

export const formatRegistry = new FormatRegistry();
