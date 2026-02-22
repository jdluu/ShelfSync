import { listen } from "@tauri-apps/api/event";
import { appDataDir, join } from "@tauri-apps/api/path";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import type React from "react";
import { useEffect, useState } from "react";
import { getLocalBooks, saveBook as saveLocalBook } from "@/services/localDb";
import type { Book } from "@/types/core";
import type { SyncProgress } from "@/types/library";

/**
 * Hook to listen for Tauri 'sync-progress' events and manage sync state.
 *
 * @summary Subscribes to backend IPC events bridging Rust's synchronization progress to the React UI.
 * @param booksRef - A stable ref to the current list of available books to resolve full book objects.
 * @param replicaPath - Custom path where synced books are stored.
 * @param onSyncComplete - Callback triggered when a book completes downloading.
 * @returns {Record<number, SyncProgress>} The current map of sync progress objects by book ID.
 * @throws {Error} Logs console errors if local DB indexing fails upon sync completion.
 * @sideEffects Mutates the local SQLite database to save the downloaded book and dispatches an OS notification upon success.
 */
export function useSyncProgress(
  booksRef: React.MutableRefObject<Book[]>,
  replicaPath: string,
  onSyncComplete: (localBooks: Book[]) => void,
) {
  const [syncProgress, setSyncProgress] = useState<Record<number, SyncProgress>>({});

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<SyncProgress>("sync-progress", async (event) => {
        const prog = event.payload;
        setSyncProgress((prev) => ({ ...prev, [prog.book_id]: prog }));

        if (prog.status === "completed") {
          try {
            const fullBook = booksRef.current.find((b) => b.id === prog.book_id);
            if (fullBook) {
              const root = replicaPath || (await appDataDir());
              const path = await join(root, fullBook.path);
              await saveLocalBook(fullBook, path);
              const stored = await getLocalBooks();
              onSyncComplete(stored);

              if (await isPermissionGranted()) {
                sendNotification({
                  title: "Download Complete",
                  body: `${prog.title} has been synced.`,
                });
              }
            }
          } catch (e) {
            console.error("Error finalizing sync payload:", e);
          }
        }
      });
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, [booksRef, replicaPath, onSyncComplete]);

  return syncProgress;
}
