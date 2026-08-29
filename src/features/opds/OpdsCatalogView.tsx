import { Book, RefreshCw } from "lucide-react";
import type React from "react";
import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import type { CategorizedLibraryRecord, PublicationLibraryInfo } from "@/types/offline";
import type { Catalog, DownloadStatus, MediaType, NavigationLink, Publication } from "@/types/opds";
import { OpdsPublicationCard } from "./OpdsPublicationCard";

interface OpdsCatalogViewProps {
  catalog: Catalog | undefined;
  loading: boolean;
  error: string | null;
  page: number;
  onPageChange: (page: number) => void;
  onRetry?: () => void;
  downloadConfig?: {
    catalogUrl: string;
    transientUsername?: string;
    transientPassword?: string;
    contentRoot: string;
  };
  onDownload?: (
    config: {
      catalogUrl: string;
      transientUsername?: string;
      transientPassword?: string;
      contentRoot: string;
    },
    publication: Publication,
    format: MediaType,
  ) => Promise<{ localPath: string; mediaType: MediaType }>;
  downloadStatuses?: Record<string, DownloadStatus>;
  downloadErrors?: Record<string, string | null>;
  downloadLocalPaths?: Record<string, string | null>;
  downloadProgress?: Record<string, number | null>;
  libraryInfoByPublicationId?: Record<string, PublicationLibraryInfo>;
  deletingRevisionId?: number | null;
  onDeleteLocal?: (publicationId: string, record: CategorizedLibraryRecord) => void;
  onViewDetails?: (publication: Publication) => void;
}

export const OpdsCatalogView: React.FC<OpdsCatalogViewProps> = ({
  catalog,
  loading,
  error,
  page,
  onPageChange,
  onRetry,
  downloadConfig,
  onDownload,
  downloadStatuses = {},
  downloadErrors = {},
  downloadLocalPaths = {},
  downloadProgress = {},
  libraryInfoByPublicationId = {},
  deletingRevisionId = null,
  onDeleteLocal,
  onViewDetails,
}) => {
  const navigationLinks = useMemo(() => {
    if (!catalog?.links) return [];
    return catalog.links.filter(
      (link: NavigationLink) => link.rel !== "self" && link.rel !== "previous",
    );
  }, [catalog?.links]);

  const isLoading = loading && !catalog;

  const loadingKeys = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => `load-${i}`);
  }, []);

  const hasDownloadProps = downloadConfig && onDownload;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-bold" aria-live="polite">
          Loading catalog...
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loadingKeys.map((key) => (
            <SkeletonCard key={key} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4" role="alert">
        <div className="alert alert-error mb-4">
          <div className="flex-1">
            <h3 className="font-bold">Unable to load catalog</h3>
            <p className="text-sm">{error}</p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="btn-error">
              <RefreshCw className="w-4 h-4 mr-1" />
              Retry
            </Button>
          )}
        </div>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} className="w-full sm:w-auto">
            Try Again
          </Button>
        )}
      </div>
    );
  }

  if (!catalog) {
    return (
      <EmptyState
        icon={Book}
        title="No Catalog Loaded"
        description="Connect to an OPDS catalog to begin browsing."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 pb-4 border-b border-base-300">
        <h2 className="font-display text-3xl font-semibold tracking-tight">{catalog.title}</h2>
        {catalog.updated && (
          <p className="text-sm text-base-content/60">
            Last updated: {new Date(catalog.updated).toLocaleDateString()}
          </p>
        )}
        {catalog.authors && catalog.authors.length > 0 && (
          <p className="text-sm text-base-content/60">By: {catalog.authors.join(", ")}</p>
        )}
        {catalog.links && catalog.links.length > 0 && (
          <nav className="flex flex-wrap gap-2 mt-2" aria-label="Catalog navigation">
            {navigationLinks.map((link: NavigationLink) => (
              <a key={link.href} href={link.href} className="btn btn-xs btn-ghost btn-secondary">
                {link.title || link.rel || link.href}
              </a>
            ))}
          </nav>
        )}
      </header>

      <section aria-label="Publications">
        {catalog.publications.length === 0 ? (
          <EmptyState
            icon={Book}
            title="No Publications Found"
            description="This catalog has no publications available on this page."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.publications.map((publication) => {
              const pubDownloadStatus = downloadStatuses[publication.id] ?? "idle";
              const pubDownloadError = downloadErrors[publication.id] ?? null;
              const pubDownloadPath = downloadLocalPaths[publication.id] ?? null;
              const pubDownloadProgress = downloadProgress[publication.id] ?? null;

              return (
                <OpdsPublicationCard
                  key={publication.id}
                  publication={publication}
                  catalogUrl={downloadConfig?.catalogUrl}
                  transientUsername={downloadConfig?.transientUsername}
                  transientPassword={downloadConfig?.transientPassword}
                  contentRoot={downloadConfig?.contentRoot}
                  onDownload={hasDownloadProps ? onDownload : undefined}
                  downloadStatus={pubDownloadStatus}
                  downloadProgress={pubDownloadProgress}
                  downloadLocalPath={pubDownloadPath}
                  downloadErrorMessage={pubDownloadError}
                  libraryInfo={libraryInfoByPublicationId[publication.id] ?? null}
                  deletingRevisionId={deletingRevisionId}
                  onDeleteLocal={
                    onDeleteLocal ? (record) => onDeleteLocal(publication.id, record) : undefined
                  }
                  onViewDetails={onViewDetails}
                />
              );
            })}
          </div>
        )}
      </section>

      {catalog.pagination && (
        <nav className="flex justify-center gap-2" aria-label="Pagination">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="btn btn-sm btn-outline"
            aria-label="Previous page"
          >
            Previous
          </button>
          <span className="badge badge-sm badge-ghost" aria-live="polite">
            Page {page}
            {catalog.pagination.total ? ` of ${Math.ceil(catalog.pagination.total)}` : ""}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!catalog.pagination.next}
            className="btn btn-sm btn-outline"
            aria-label="Next page"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
};
