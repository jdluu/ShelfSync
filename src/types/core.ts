export interface Book {
  id: number;
  title: string;
  authors: string;
  path: string; // Relative path on Host (Calibre structure)
  formats?: string[] | null; // Available formats from Host
  cover_url?: string | null; // Constructed URL (optional)
  series?: string | null;
  series_index?: number | null;
  tags?: string[] | null;
  publisher?: string | null;
  description?: string | null;
  rating?: number | null;
  language?: string | null;
  published_date?: string | null;

  // Client-side only extensions
  local_path?: string | null;
  remote_id?: number | null;
  format?: string | null;
  read_status?: "unread" | "reading" | "finished" | null;
}

export interface ConnectionInfo {
  ip: string;
  port: number;
  hostname: string;
  pin?: string | null;
}

export type Host = ConnectionInfo;
