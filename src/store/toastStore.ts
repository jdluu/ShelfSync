import { create } from "zustand";

interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error" | "progress";
  /** Current progress count (e.g. 3 of 10). Only used by "progress" type. */
  current?: number;
  /** Total count for progress tracking. */
  total?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"]) => void;
  removeToast: (id: string) => void;
  /** Create or update a progress toast by a stable key. */
  upsertProgress: (key: string, message: string, current: number, total: number) => void;
  /** Transition a progress toast to a success/error state and auto-dismiss. */
  finishProgress: (key: string, message: string, type?: "success" | "error") => void;
}

/**
 * Lightweight toast notification store.
 *
 * Regular toasts auto-dismiss after 3 seconds.
 * Progress toasts persist until explicitly finished.
 */
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  upsertProgress: (key, message, current, total) => {
    set((state) => {
      const existing = state.toasts.find((t) => t.id === key);
      if (existing) {
        return {
          toasts: state.toasts.map((t) => (t.id === key ? { ...t, message, current, total } : t)),
        };
      }
      return {
        toasts: [...state.toasts, { id: key, message, type: "progress" as const, current, total }],
      };
    });
  },

  finishProgress: (key, message, type = "success") => {
    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === key ? { ...t, message, type, current: undefined, total: undefined } : t,
      ),
    }));

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== key) }));
    }, 4000);
  },
}));
