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

/**
 * Diagnoses common OPDS error patterns and returns actionable recovery guidance.
 * Aligns with Nielsen Norman Group Heuristic #9 (Help users recognize, diagnose, and recover from errors).
 */
export function diagnoseOpdsError(error: unknown): string | null {
  if (!error) return null;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  const lower = message.toLowerCase();
  if (lower.includes("401") || lower.includes("unauthorized")) {
    return "Check that your username and password are correct. Some servers also require enabling OPDS access in user settings.";
  }
  if (lower.includes("403") || lower.includes("forbidden")) {
    return "Access denied. Make sure your account has permissions to browse the library.";
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return "Feed not found. Verify the URL endpoint (OPDS feeds typically end in /opds or /opds/v1.2/catalog).";
  }
  if (lower.includes("econnrefused") || lower.includes("connection refused")) {
    return "Connection refused. Confirm your OPDS server is running and the port is reachable from this device.";
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return "Connection timed out. Check your network or Wi-Fi connection.";
  }
  return null;
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
