import { isTauri } from "@/utils/tauri";

/**
 * Displays a native notification to the user for critical errors.
 *
 * Uses `tauri-plugin-notification` when running inside Tauri, which shows
 * an OS-native notification (toast on Windows, notification center on Linux/mobile).
 * Falls back to `console.error` in browser environments.
 *
 * @param title   - Short heading for the notification (e.g., "Sync Failed").
 * @param message - Descriptive body text explaining the error.
 */
export async function notifyError(title: string, message: string): Promise<void> {
  console.error(`[${title}] ${message}`);

  if (isTauri()) {
    try {
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        "@tauri-apps/plugin-notification"
      );

      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }

      if (granted) {
        sendNotification({ title, body: message });
      }
    } catch {
      // Notification plugin unavailable, console.error already logged above
    }
  }
}
