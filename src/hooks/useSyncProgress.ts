import { listen } from "@tauri-apps/api/event";
import { appDataDir, join } from "@tauri-apps/api/path";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { getLocalBooks, saveBook as saveLocalBook } from "@/services/localDb";
import { useToastStore } from "@/store/toastStore";
import type { Book } from "@/types/core";
import type { SyncProgress } from "@/types/library";

const SYNC_TOAST_KEY = "sync-progress";

/**
 * Hook to listen for Tauri 'sync-progress' events and manage sync state.
 *
 * Shows a single updating progress toast instead of one notification per book.
 * Sends one summary OS notification when the entire batch completes.
 *
 * @param booksRef - A stable ref to the current list of available books.
 * @param offlineStoragePath - Custom path where synced books are stored.
 * @param onSyncComplete - Callback triggered when a book completes downloading.
 */
export function useSyncProgress(
  booksRef: React.MutableRefObject<Book[]>,
  offlineStoragePath: string,
  onSyncComplete: (localBooks: Book[]) => void,
) {
  const [syncProgress, setSyncProgress] = useState<Record<number, SyncProgress>>({});

  // Track batch state across events without re-subscribing
  const batchRef = useRef({ completed: 0, failed: 0, total: 0, active: false, knownIds: new Set<number>() });

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<SyncProgress>("sync-progress", async (event) => {
        const prog = event.payload;
        setSyncProgress((prev) => ({ ...prev, [prog.book_id]: prog }));

        const batch = batchRef.current;

        // Detect batch start: first "downloading" event after idle
        if (prog.status === "downloading" && !batch.active) {
          batch.active = true;
          batch.completed = 0;
          batch.failed = 0;
          // total is unknown upfront; we'll infer from max book_id count
          batch.total = 0;
          batch.knownIds.clear();
        }

        // Count unique books in progress to estimate total
        if (batch.active) {
          batch.knownIds.add(prog.book_id);
          batch.total = Math.max(batch.total, batch.knownIds.size);
        }

        if (prog.status === "downloading") {
          // Update the progress toast
          useToastStore
            .getState()
            .upsertProgress(SYNC_TOAST_KEY, prog.title, batch.completed, batch.total);
        }

        if (prog.status === "completed") {
          batch.completed++;

          try {
            const fullBook = booksRef.current.find((b) => b.id === prog.book_id);
            if (fullBook) {
              const root = offlineStoragePath || (await appDataDir());
              const path = await join(root, prog.path || fullBook.path);
              await saveLocalBook(fullBook, path);
              const stored = await getLocalBooks();
              onSyncComplete(stored);
            }
          } catch (e) {
            console.error("Error finalizing sync payload:", e);
          }

          // Update progress toast
          useToastStore
            .getState()
            .upsertProgress(SYNC_TOAST_KEY, prog.title, batch.completed, batch.total);

          // Check if batch is done
          if (batch.completed + batch.failed >= batch.total && batch.total > 0) {
            const count = batch.completed;
            useToastStore
              .getState()
              .finishProgress(
                SYNC_TOAST_KEY,
                `${count} book${count !== 1 ? "s" : ""} synced!`,
                "success",
              );

            // Single summary OS notification
            try {
              if (await isPermissionGranted()) {
                sendNotification({
                  title: "Sync Complete",
                  body: `${count} book${count !== 1 ? "s" : ""} downloaded successfully.`,
                });
              }
            } catch {
              // Notification plugin unavailable
            }

            // Reset batch state
            batch.active = false;
            batch.completed = 0;
            batch.failed = 0;
            batch.total = 0;
          }
        }

        if (prog.status === "error") {
          batch.failed++;

          // Check if batch is done
          if (batch.completed + batch.failed >= batch.total && batch.total > 0) {
            useToastStore
              .getState()
              .finishProgress(
                SYNC_TOAST_KEY,
                `Sync finished: ${batch.completed} done, ${batch.failed} failed`,
                batch.failed > 0 ? "error" : "success",
              );

            batch.active = false;
            batch.completed = 0;
            batch.failed = 0;
            batch.total = 0;
          }
        }
      });
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, [booksRef, offlineStoragePath, onSyncComplete]);

  return syncProgress;
}
