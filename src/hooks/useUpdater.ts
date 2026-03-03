import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useCallback, useState } from "react";
import { useToastStore } from "@/store/toastStore";

import { isMobile } from "@/utils/tauri";

export function useUpdater() {
  const [isChecking, setIsChecking] = useState(false);
  const { upsertProgress, finishProgress, addToast } = useToastStore();

  const checkForUpdates = useCallback(
    async (manual = false) => {
      if (isMobile()) {
        if (manual) {
          addToast("Updates are managed via the app store on mobile.", "info");
        }
        return;
      }

      try {
        setIsChecking(true);
        const update = await check();

        if (update) {
          const shouldUpdate = await ask(
            `Version ${update.version} is available.\n\nRelease notes:\n${update.body}\n\nDo you want to download and install this update now?`,
            {
              title: "ShelfSync Update Available",
              kind: "info",
            },
          );

          if (shouldUpdate) {
            let downloaded = 0;
            let contentLength = 0;

            await update.downloadAndInstall((event) => {
              switch (event.event) {
                case "Started":
                  contentLength = event.data.contentLength || 0;
                  upsertProgress(
                    "updater",
                    `Downloading update (${(contentLength / 1024 / 1024).toFixed(1)}MB)...`,
                    0,
                    contentLength,
                  );
                  break;
                case "Progress":
                  downloaded += event.data.chunkLength;
                  upsertProgress("updater", `Downloading update...`, downloaded, contentLength);
                  break;
                case "Finished":
                  finishProgress("updater", "Update downloaded! Restarting...", "success");
                  break;
              }
            });

            await relaunch();
          }
        } else if (manual) {
          addToast("You are on the latest version of ShelfSync.", "success");
        }
      } catch (error) {
        console.error("Failed to check for updates:", error);
        if (manual) {
          addToast("Failed to check for updates. Are you connected to the internet?", "error");
        }
      } finally {
        setIsChecking(false);
      }
    },
    [addToast, finishProgress, upsertProgress],
  );

  return { checkForUpdates, isChecking };
}
