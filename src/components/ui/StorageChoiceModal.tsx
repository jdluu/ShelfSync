import { FolderDown, Search } from "lucide-react";
import type React from "react";
import { useLibraryStore } from "@/store/libraryStore";

/**
 * Mobile-only dialog shown when no native directory chooser is available.
 * Offers the recommended app location or an advanced folder browse fallback.
 */
export const StorageChoiceModal: React.FC = () => {
  const storageChoiceOpen = useLibraryStore((s) => s.storageChoiceOpen);
  const offlineStoragePath = useLibraryStore((s) => s.offlineStoragePath);
  const chooseRecommendedStorage = useLibraryStore((s) => s.chooseRecommendedStorage);
  const browseForStorage = useLibraryStore((s) => s.browseForStorage);
  const dismissStorageChoice = useLibraryStore((s) => s.dismissStorageChoice);

  if (!storageChoiceOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-choice-title"
    >
      <div className="bg-base-200 rounded-2xl shadow-2xl border border-base-300 w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="text-center flex flex-col gap-1">
          <h2 id="storage-choice-title" className="text-xl font-bold">
            Choose Download Location
          </h2>
          <p className="text-sm text-base-content/70">
            Pick where downloaded books are stored on this device.
          </p>
        </div>

        {offlineStoragePath && (
          <p
            className="text-[11px] font-mono text-base-content/50 truncate text-center px-2"
            title={offlineStoragePath}
          >
            Current: {offlineStoragePath}
          </p>
        )}

        <button type="button" className="btn btn-primary w-full" onClick={() => void chooseRecommendedStorage()}>
          <FolderDown className="w-4 h-4" aria-hidden="true" />
          Use Recommended Location
        </button>
        <button type="button" className="btn btn-outline w-full" onClick={() => void browseForStorage()}>
          <Search className="w-4 h-4" aria-hidden="true" />
          Browse for a Folder
        </button>

        <p className="text-[11px] text-base-content/50 text-center">
          Browsing opens your device's file picker; confirm the suggested file inside the folder you
          want to use.
        </p>

        <button type="button" className="btn btn-ghost btn-sm w-full" onClick={dismissStorageChoice}>
          Cancel
        </button>
      </div>
    </div>
  );
};
