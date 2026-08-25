import { listen } from "@tauri-apps/api/event";
import type {
  AcquisitionFormat,
  Catalog,
  DownloadConfig,
  DownloadProgress,
  DownloadResult,
  FetchOpdsCatalogParams,
  MediaType,
  Publication,
} from "@/types/opds";
import { isTauri, safeInvoke } from "@/utils/tauri";

export type DownloadProgressEvent = {
  publication_id: string;
  title: string;
  bytes_received: number;
  total_bytes: number | null;
  status: "Starting" | "Downloading" | "Completed" | "Failed";
};

type TauriDownloadResult = {
  local_path: string;
  media_type: string;
};

const OPDS_DOWNLOAD_PROGRESS_EVENT = "opds-download-progress";

const EPUB_MEDIA_TYPE: MediaType = "application/epub+zip";
const PDF_MEDIA_TYPE: MediaType = "application/pdf";

export const opdsClient = {
  fetchCatalog: (params: FetchOpdsCatalogParams) => {
    return safeInvoke<Catalog>("fetch_opds_catalog", {
      url: params.url,
      username: params.username,
      password: params.password,
      page: params.page ?? undefined,
      page_size: params.page_size ?? undefined,
    });
  },

  downloadPublication: (
    config: DownloadConfig,
    publication: Publication,
    format: MediaType,
  ): Promise<DownloadResult> => {
    const formattedFormat = format as string;
    if (formattedFormat !== EPUB_MEDIA_TYPE && formattedFormat !== PDF_MEDIA_TYPE) {
      return Promise.reject(
        new Error(`Unsupported acquisition format: ${format}. Only EPUB and PDF are supported.`),
      );
    }

    const acquisitionLink = publication.links.find(
      (link) => link.media_type === format || link.media_type === EPUB_MEDIA_TYPE,
    );

    if (!acquisitionLink) {
      return Promise.reject(new Error(`No acquisition link found for format: ${format}`));
    }

    return safeInvoke<TauriDownloadResult>("download_opds_publication", {
      catalog_url: config.catalogUrl,
      username: config.transientUsername ?? "",
      password: config.transientPassword ?? "",
      publication: {
        id: publication.id,
        updated: publication.updated,
        title: publication.title,
        authors: publication.authors,
        pubdate: publication.pubdate,
        identifiers: publication.identifiers,
        series: publication.series,
        languages: publication.languages,
        categories: publication.categories ?? [],
        relations: publication.relations,
        descriptions: publication.descriptions,
        links: [acquisitionLink],
        providers: publication.providers,
        representative: publication.representative,
      },
      content_root: config.contentRoot,
    }).then((result) => ({
      localPath: result.local_path,
      mediaType: result.media_type as MediaType,
    }));
  },

  onDownloadProgress: (
    publicationId: string,
    callback: (progress: DownloadProgress) => void,
  ): (() => void) => {
    if (!isTauri()) {
      return () => {};
    }

    let active = true;
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<DownloadProgressEvent>(OPDS_DOWNLOAD_PROGRESS_EVENT, (event) => {
        if (!active) {
          return;
        }
        if (event.payload.publication_id !== publicationId) {
          return;
        }

        const { status, bytes_received, total_bytes } = event.payload;

        const normalizedStatus: DownloadProgress["status"] =
          status.toLowerCase() as DownloadProgress["status"];

        callback({
          publicationId: event.payload.publication_id,
          bytesReceived: bytes_received,
          totalBytes: total_bytes,
          status: normalizedStatus,
          error: normalizedStatus === "failed" ? event.payload.title : undefined,
        });
      });
    };

    setupListener();

    return () => {
      active = false;
      if (unlisten) {
        unlisten();
      }
    };
  },

  getAvailableFormats: (publication: Publication): AcquisitionFormat[] => {
    const formats: AcquisitionFormat[] = [];

    if (!publication.links) {
      return formats;
    }

    for (const link of publication.links) {
      if (link.media_type) {
        if (link.media_type === EPUB_MEDIA_TYPE || link.media_type === PDF_MEDIA_TYPE) {
          formats.push({
            href: link.href,
            mediaType: link.media_type as MediaType,
          });
        }
      }
    }

    return formats;
  },

  getPreferredFormat: (
    publication: Publication,
    preferred: MediaType,
  ): AcquisitionFormat | null => {
    const formats = opdsClient.getAvailableFormats(publication);
    return formats.find((f) => f.mediaType === preferred) || null;
  },
};
