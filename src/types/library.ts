export type AppMode = "unselected" | "host" | "client";

export interface SyncProgress {
  book_id: number;
  title: string;
  status: "pending" | "downloading" | "completed" | "error";
  progress: number;
  queue_position: number;
  queue_total: number;
  path?: string;
  error?: string;
}
