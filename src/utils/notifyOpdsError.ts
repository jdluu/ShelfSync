import { useToastStore } from "@/store/toastStore";

/**
 * Single source for surfacing OPDS errors (opdsClient / offlineLibrary
 * failures) as error toasts, with consistent message shaping.
 */

/** Extract a user-presentable message from an unknown thrown value. */
export function formatOpdsErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export interface NotifyOpdsErrorOptions {
  /** Short context prefix, e.g. "Catalog refresh". */
  context?: string;
  /** Message used when the error carries no usable text. */
  fallback?: string;
}

/** Show an OPDS error as an error toast via the shared toast store. */
export function notifyOpdsError(error: unknown, options: NotifyOpdsErrorOptions = {}): void {
  const detail = formatOpdsErrorMessage(error, options.fallback);
  const message = options.context ? `${options.context}: ${detail}` : detail;
  useToastStore.getState().addToast(message, "error");
}
