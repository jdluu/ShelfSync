import { CheckCircle, Info, Loader, X, XCircle } from "lucide-react";
import type React from "react";
import { useToastStore } from "@/store/toastStore";

const iconMap = {
  info: <Info className="w-5 h-5 shrink-0" />,
  success: <CheckCircle className="w-5 h-5 shrink-0" />,
  error: <XCircle className="w-5 h-5 shrink-0" />,
  progress: <Loader className="w-5 h-5 shrink-0 animate-spin" />,
};

const colorMap = {
  info: "alert-info",
  success: "alert-success",
  error: "alert-error",
  progress: "alert-info",
};

/**
 * Renders all active toast notifications as a fixed overlay.
 *
 * Mount once at the app root (e.g. inside App.tsx).
 */
export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toast toast-end toast-bottom z-[9999] pb-4 pr-4 gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`alert ${colorMap[toast.type]} shadow-lg py-3 px-4 min-w-[260px] max-w-xs animate-in slide-in-from-right-5 fade-in duration-300 flex-col items-start gap-1`}
        >
          <div className="flex items-center gap-2 w-full">
            {iconMap[toast.type]}
            <span className="text-sm font-medium flex-1">{toast.message}</span>
            {toast.type !== "progress" && (
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle shrink-0"
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {toast.type === "progress" && toast.total != null && toast.current != null && (
            <div className="w-full mt-1">
              <progress
                className="progress progress-primary w-full h-2"
                value={toast.current}
                max={toast.total}
              />
              <span className="text-[10px] opacity-70 mt-0.5 block text-right">
                {toast.current}/{toast.total}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
