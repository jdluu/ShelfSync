import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
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
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }

      if (granted) {
        sendNotification({ title, body: message });
      }
    } catch {
      // Notification plugin unavailable
    }
  }
}

/**
 * Displays a native notification to the user for successful operations.
 */
export async function notifySuccess(title: string, message: string): Promise<void> {
  console.info(`[${title}] ${message}`);

  if (isTauri()) {
    try {
      const granted = await isPermissionGranted();
      if (granted) {
        sendNotification({ title, body: message });
      }
    } catch {
      // Notification plugin unavailable
    }
  }
}

/**
 * Displays a native notification for general information.
 */
export async function notifyInfo(title: string, message: string): Promise<void> {
  console.log(`[${title}] ${message}`);

  if (isTauri()) {
    try {
      const granted = await isPermissionGranted();
      if (granted) {
        sendNotification({ title, body: message });
      }
    } catch {
      // Notification plugin unavailable
    }
  }
}
