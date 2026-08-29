import { BookMarked, KeyRound, Link2, LogOut, PlugZap, RefreshCw, User } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type {
  CategorizedLibraryRecord,
  OfflineRefreshReport,
  PublicationLibraryInfo,
} from "@/types/offline";
import type { Catalog, DownloadStatus, MediaType, Publication } from "@/types/opds";
import { OpdsCatalogView } from "./OpdsCatalogView";

export interface OpdsConnectPayload {
  url: string;
  username: string;
  password: string;
}

interface OpdsCatalogScreenProps {
  url: string;
  onUrlChange: (url: string) => void;
  username: string;
  onUsernameChange: (username: string) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  connected: boolean;
  onConnect: (payload: OpdsConnectPayload) => void;
  onDisconnect: () => void;
  catalog?: Catalog;
  loading: boolean;
  error: string | null;
  page: number;
  onPageChange: (page: number) => void;
  contentRoot: string;
  onContentRootChange: (contentRoot: string) => void;
  downloadStatuses?: Record<string, DownloadStatus>;
  downloadErrors?: Record<string, string | null>;
  downloadLocalPaths?: Record<string, string | null>;
  downloadProgress?: Record<string, number | null>;
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
  libraryInfoByPublicationId?: Record<string, PublicationLibraryInfo>;
  deletingRevisionId?: number | null;
  onDeleteLocal?: (publicationId: string, record: CategorizedLibraryRecord) => void;
  onRefreshLibrary?: () => Promise<OfflineRefreshReport | null>;
  onViewDetails?: (publication: Publication) => void;
  onSaveCatalog?: () => void | Promise<void>;
  savedCatalogs?: React.ReactNode;
}

export const isValidOpdsCatalogUrl = (value: string): boolean => {
  return /^https?:\/\//i.test(value.trim());
};

export const OpdsCatalogScreen: React.FC<OpdsCatalogScreenProps> = ({
  url,
  onUrlChange,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  connected,
  onConnect,
  onDisconnect,
  catalog,
  loading,
  error,
  page,
  onPageChange,
  contentRoot,
  onContentRootChange,
  downloadStatuses = {},
  downloadErrors = {},
  downloadLocalPaths = {},
  downloadProgress,
  onDownload,
  libraryInfoByPublicationId = {},
  deletingRevisionId = null,
  onDeleteLocal,
  onRefreshLibrary,
  onViewDetails,
  onSaveCatalog,
  savedCatalogs,
}) => {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [refreshingLibrary, setRefreshingLibrary] = useState(false);
  const [refreshSummary, setRefreshSummary] = useState<string | null>(null);
  const contentRegionRef = useRef<HTMLDivElement | null>(null);
  const previousPageRef = useRef<number | null>(null);

  useEffect(() => {
    if (!connected || loading || !catalog) return;
    const previousPage = previousPageRef.current;
    previousPageRef.current = page;
    if (previousPage !== null && previousPage !== page) {
      contentRegionRef.current?.focus({ preventScroll: true });
    }
  }, [catalog, connected, loading, page]);

  const handleRefreshLibrary = async () => {
    if (!onRefreshLibrary || refreshingLibrary) return;
    setRefreshingLibrary(true);
    setRefreshSummary(null);
    try {
      const report = await onRefreshLibrary();
      if (report) {
        const parts: string[] = [`${report.publications_seen} publications checked`];
        if (report.added.length > 0) parts.push(`${report.added.length} new`);
        if (report.changed.length > 0) parts.push(`${report.changed.length} changed`);
        if (report.removed.length > 0)
          parts.push(`${report.removed.length} removed from server (kept locally)`);
        if (report.truncated) parts.push("listing incomplete");
        setRefreshSummary(parts.join(", "));
      }
    } finally {
      setRefreshingLibrary(false);
    }
  };

  const handleUrlChange = (nextUrl: string) => {
    setValidationError(null);
    onUrlChange(nextUrl);
  };

  const handleConnect = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setValidationError("Catalog URL is required.");
      return;
    }
    if (!isValidOpdsCatalogUrl(trimmedUrl)) {
      setValidationError("Catalog URL must start with http:// or https://.");
      return;
    }
    setValidationError(null);
    onConnect({
      url: trimmedUrl,
      username: username.trim(),
      password,
    });
  };

  const handleDisconnect = () => {
    onUsernameChange("");
    onPasswordChange("");
    setValidationError(null);
    onDisconnect();
  };

  return (
    <div className="flex flex-col gap-6">
      {!connected && (
        <form
          aria-label="OPDS catalog connection"
          aria-busy={loading}
          className="card bg-base-200 border border-base-300 max-w-xl mx-auto w-full mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            handleConnect();
          }}
        >
          <div className="card-body gap-5 p-6 sm:p-8">
            <div className="flex flex-col gap-1.5 mb-1">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                Connect your shelf
              </h2>
              <p className="text-sm text-base-content/60">
                Point ShelfSync at your OPDS catalog. Credentials stay in memory and are never
                saved.
              </p>
            </div>

            <label className="form-control w-full" htmlFor="opds-catalog-url">
              <span className="label-text mb-1 font-medium">Catalog URL</span>
              <input
                id="opds-catalog-url"
                type="text"
                inputMode="url"
                autoComplete="off"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com/opds"
                aria-invalid={validationError ? true : undefined}
                aria-describedby={validationError ? "opds-url-error" : undefined}
                className={`input input-bordered w-full ${validationError ? "input-error" : ""}`}
              />
            </label>
            {validationError && (
              <p id="opds-url-error" role="alert" className="text-sm text-error">
                {validationError}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-control w-full" htmlFor="opds-username">
                <span className="label-text mb-1 font-medium">
                  <User className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  Username (optional)
                </span>
                <input
                  id="opds-username"
                  type="text"
                  autoComplete="off"
                  value={username}
                  onChange={(e) => onUsernameChange(e.target.value)}
                  className="input input-bordered w-full"
                />
              </label>
              <label className="form-control w-full" htmlFor="opds-password">
                <span className="label-text mb-1 font-medium">
                  <KeyRound className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  Password (optional)
                </span>
                <input
                  id="opds-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  className="input input-bordered w-full"
                />
              </label>
            </div>

            <div className="card-actions justify-between items-center">
              {onSaveCatalog && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void onSaveCatalog()}
                  aria-label="Save this catalog for quick access"
                >
                  <BookMarked className="h-4 w-4" aria-hidden="true" />
                  Save catalog
                </Button>
              )}
              <Button variant="primary" type="submit" disabled={loading}>
                <PlugZap className="h-4 w-4" aria-hidden="true" />
                Connect
              </Button>
            </div>
          </div>
        </form>
      )}

      {!connected && savedCatalogs}

      {connected && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-base-200/60 px-4 py-3">
            <p className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4 text-success" aria-hidden="true" />
              <span className="sr-only">Connected to catalog:</span>
              <span className="font-mono break-all">{url}</span>
            </p>
            <div className="flex items-center gap-2">
              <details
                className="collapse collapse-arrow rounded-lg bg-base-100 border border-base-content/10"
                data-testid="opds-advanced-options"
              >
                <summary className="collapse-title min-h-0 py-2 text-sm font-medium">
                  Advanced options
                </summary>
                <div className="collapse-content">
                  <label className="form-control w-full" htmlFor="opds-content-root">
                    <span className="label-text mb-1 font-medium">Content root</span>
                    <input
                      id="opds-content-root"
                      type="text"
                      autoComplete="off"
                      value={contentRoot}
                      onChange={(e) => onContentRootChange(e.target.value)}
                      placeholder="/downloads/opds"
                      className="input input-bordered input-sm w-full"
                    />
                  </label>
                </div>
              </details>
              {onRefreshLibrary && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshLibrary}
                  disabled={refreshingLibrary}
                  aria-label="Refresh catalog metadata and reconcile downloads"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${refreshingLibrary ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {refreshingLibrary ? "Refreshing..." : "Refresh"}
                </Button>
              )}
              <Button variant="danger" onClick={handleDisconnect}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Disconnect
              </Button>
            </div>
            {refreshSummary && (
              <p className="text-xs text-base-content/60" role="status" aria-live="polite">
                {refreshSummary}
              </p>
            )}
          </div>

          {catalog && (
            <p className="sr-only" role="status" aria-live="polite">
              {`${catalog.title}: page ${page}, ${catalog.publications.length} publication${
                catalog.publications.length === 1 ? "" : "s"
              }`}
            </p>
          )}

          <div ref={contentRegionRef} tabIndex={-1} className="outline-none">
            <OpdsCatalogView
              catalog={catalog}
              loading={loading}
              error={error}
              page={page}
              onPageChange={onPageChange}
              downloadConfig={{
                catalogUrl: url.trim(),
                transientUsername: username,
                transientPassword: password,
                contentRoot,
              }}
              onDownload={onDownload}
              downloadStatuses={downloadStatuses}
              downloadErrors={downloadErrors}
              downloadLocalPaths={downloadLocalPaths}
              downloadProgress={downloadProgress}
              libraryInfoByPublicationId={libraryInfoByPublicationId}
              deletingRevisionId={deletingRevisionId}
              onDeleteLocal={onDeleteLocal}
              onViewDetails={onViewDetails}
            />
          </div>
        </>
      )}
    </div>
  );
};
