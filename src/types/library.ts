import type { Book, Host } from "./core";

export type AppMode = "unselected" | "host" | "client";

export interface SyncProgress {
  book_id: number;
  title: string;
  status: "pending" | "downloading" | "completed" | "error";
  progress: number;
  total: number;
}

export interface LibraryContextType {
  // State
  appMode: AppMode;
  books: Book[];
  localBooks: Book[];
  loading: boolean;
  error: string | null;
  libraryPath: string;
  offlineStoragePath: string;
  connectedHost: Host | null;
  authRequired: boolean;
  pairingHost: Host | null;
  authTokens: Record<string, string>;
  syncProgress: Record<number, SyncProgress>;

  // Actions
  setAppMode: (mode: AppMode) => Promise<void>;
  connectToHost: (host: Host) => Promise<void>;
  pair: (pin: string) => Promise<void>;
  disconnect: () => void;
  syncBook: (book: Book) => Promise<void>;
  syncBooks: (books: Book[]) => Promise<void>;
  selectLibraryFolder: () => Promise<void>;
  selectOfflineStorageFolder: () => Promise<void>;
  openLocalBook: (path: string) => Promise<void>;
  toggleReadStatus: (book: Book) => Promise<void>;
  clearError: () => void;
}
