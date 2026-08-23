import { KeyRound, Link2, LogOut, PlugZap, User } from "lucide-react";
import type React from "react";
import { useState } from "react";
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
  onDownload,
}) => {
  const [validationError, setValidationError] = useState<string | null>(null);

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
          className="card bg-base-100/80 border border-base-content/10"
          onSubmit={(e) => {
            e.preventDefault();
            handleConnect();
          }}
        >
          <div className="card-body gap-4">
            <h2 className="card-title text-lg">Connect to OPDS catalog</h2>
            <p className="text-sm text-base-content/60">
              Credentials are kept in memory only and are never saved.
            </p>

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

            <div className="card-actions justify-end">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <PlugZap className="h-4 w-4" aria-hidden="true" />
                Connect
              </button>
            </div>
          </div>
        </form>
      )}

      {connected && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-base-200/60 px-4 py-3">
            <p className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4 text-success" aria-hidden="true" />
              <span className="sr-only">Connected to catalog:</span>
              <span className="font-mono break-all">{url}</span>
            </p>
            <div className="flex items-center gap-2">
              <label className="form-control w-full max-w-xs" htmlFor="opds-content-root">
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
              <button
                type="button"
                onClick={handleDisconnect}
                className="btn btn-outline btn-error"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Disconnect
              </button>
            </div>
          </div>

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
          />
        </>
      )}
    </div>
  );
};
