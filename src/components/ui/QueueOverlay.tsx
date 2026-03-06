import { AnimatePresence, domAnimation, LazyMotion, m } from "framer-motion";
import { AlertCircle, CheckCircle, Download } from "lucide-react";
import type React from "react";

interface SyncItem {
  book_id: number;
  title: string;
  status: string;
  progress: number;
}

interface QueueOverlayProps {
  progress: Record<number, SyncItem>;
  onClose?: () => void;
}

export const QueueOverlay: React.FC<QueueOverlayProps> = ({ progress }) => {
  // Get all active or recently completed items
  const items = Object.values(progress).filter((p) => p.status !== "idle");

  // Sort to show active first
  items.sort((a, b) => {
    if (a.status === "downloading") return -1;
    if (b.status === "downloading") return 1;
    return 0;
  });

  if (items.length === 0) return null;

  const completedCount = items.filter((p) => p.status === "completed").length;
  const totalCount = items.length;

  return (
    <output
      className="fixed bottom-6 right-6 z-50 w-80 max-h-[400px] bg-base-100 rounded-xl shadow-2xl border border-base-300 flex flex-col overflow-hidden backdrop-blur-md"
      aria-live="polite"
      aria-label="Sync progress"
    >
      <div className="p-4 border-b border-base-200 bg-base-200/50">
        <div className="flex justify-between items-center">
          <div className="flex gap-2 items-center">
            <Download className="text-info" />
            <div className="flex flex-col">
              <span className="font-bold text-sm">Sync Progress</span>
              <span className="text-xs text-base-content/70">
                {completedCount} of {totalCount} syncs finished
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-2 gap-2 flex flex-col overflow-y-auto overflow-x-hidden">
        <LazyMotion features={domAnimation}>
          <AnimatePresence mode="popLayout">
            {items.slice(0, 5).map((p) => (
              <m.div
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: -50, scale: 0.95 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                key={p.book_id}
                className="p-3 rounded-lg bg-base-200 shadow-sm"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between w-full items-center">
                    <span className="text-xs font-semibold truncate max-w-[200px]">{p.title}</span>
                    <StatusIcon status={p.status} />
                  </div>

                  {p.status === "downloading" && (
                    <div className="flex flex-col gap-1 w-full">
                      <progress
                        className="progress progress-info w-full h-1"
                        value={p.progress * 100}
                        max="100"
                      ></progress>
                      <div className="flex justify-between text-[10px] text-base-content/70">
                        <span>Downloading...</span>
                        <span>{Math.round(p.progress * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </m.div>
            ))}
          </AnimatePresence>
          {items.length > 5 && (
            <m.div
              layout
              key="more-items"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-center py-1 text-base-content/50"
            >
              + {items.length - 5} more in queue
            </m.div>
          )}
        </LazyMotion>
      </div>
    </output>
  );
};

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  if (status === "completed") return <CheckCircle className="text-success w-4 h-4" />;
  if (status === "error") return <AlertCircle className="text-error w-4 h-4" />;
  return <span className="loading loading-spinner loading-xs text-info"></span>;
};
