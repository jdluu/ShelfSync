import { Search, WifiOff } from "lucide-react";
import type React from "react";
import type { Host } from "@/types/core";

interface ClientHeaderProps {
  activeTab: "explore" | "library";
  connectedHost: Host | null;
  error: string | null;
  offlineStoragePath: string;
  selectOfflineStorageFolder: () => void;
  disconnect: () => void;
  clearError: () => void;
}

export const ClientHeader: React.FC<ClientHeaderProps> = ({
  activeTab,
  connectedHost,
  error,
  offlineStoragePath,
  selectOfflineStorageFolder,
  disconnect,
  clearError,
}) => {
  return (
    <>
      {/* Storage Path Prompt - Only show when relevant */}
      {!offlineStoragePath && (activeTab === "library" || connectedHost) && (
        <div className="mb-4 p-4 bg-warning/10 border border-warning/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
              <Search className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-sm font-bold text-base-content">Set Download Location</p>
              <p className="text-xs text-base-content/60">
                Choose where to save your books before syncing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={selectOfflineStorageFolder}
            className="btn btn-warning btn-sm w-full sm:w-auto"
          >
            Select Folder
          </button>
        </div>
      )}

      {/* Connection banner */}
      {connectedHost && (
        <div className="mb-4 p-3 bg-primary/5 border border-primary/10 rounded-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="badge badge-success badge-xs gap-1 py-2 font-bold px-2">
              <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
              Live Sync
            </div>
            <div className="flex flex-col">
              <p className="text-xs font-bold text-base-content/90 leading-none">
                {connectedHost.hostname}
              </p>
              <p className="text-[10px] font-mono opacity-50">
                {connectedHost.ip}:{connectedHost.port}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-[10px] font-bold text-primary uppercase tracking-wider opacity-70">
              Connected
            </div>
            <button
              type="button"
              onClick={disconnect}
              className="btn btn-xs btn-ghost border border-base-300 gap-1"
              aria-label="Disconnect from host"
            >
              <WifiOff className="w-3 h-3" />
              <span>Exit</span>
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div role="alert" className="alert alert-error mb-6 flex justify-between items-start">
          <div className="flex gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="btn btn-ghost btn-xs btn-circle"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
};
