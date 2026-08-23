export type OfflineLibrarySection =
  | "complete"
  | "downloading"
  | "failed"
  | "unavailable"
  | "superseded";

export type StoredJobState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | null;

export interface OfflineLibraryRecord {
  publication_id: number;
  account_id: number;
  provider: string;
  canonical_id: string;
  metadata_json: string;
  publication_available: boolean;
  acquisition_id: number;
  media_type: string;
  canonical_url: string;
  revision_id: number;
  is_current_revision: boolean;
  local_relative_path: string | null;
  expected_length: number | null;
  job_state: StoredJobState;
  job_error: string | null;
  updated_at: number;
}

export interface OfflineLibrarySnapshot {
  complete: OfflineLibraryRecord[];
  downloading: OfflineLibraryRecord[];
  failed: OfflineLibraryRecord[];
  unavailable: OfflineLibraryRecord[];
  superseded: OfflineLibraryRecord[];
}

export interface CategorizedLibraryRecord extends OfflineLibraryRecord {
  section: OfflineLibrarySection;
}

export interface PublicationLibraryInfo {
  primary: CategorizedLibraryRecord | null;
  superseded: CategorizedLibraryRecord[];
}

export interface OfflineRefreshReport {
  added: string[];
  changed: string[];
  removed: string[];
  publications_seen: number;
  pages_visited: number;
  truncated: boolean;
}

export interface OfflineDeletedContent {
  revision_id: number;
  deleted_file: boolean;
}

export interface OfflineDiskSpaceStatus {
  available_bytes: number;
  required_bytes: number;
  sufficient: boolean;
}

const SECTION_PRIORITY: OfflineLibrarySection[] = [
  "downloading",
  "unavailable",
  "failed",
  "complete",
];

/**
 * Groups persisted records by canonical publication id so catalog cards can
 * surface their offline state. The primary record follows a priority order so
 * activity and problems are never hidden by an older completed copy.
 */
export function buildPublicationLibraryInfo(
  snapshot: OfflineLibrarySnapshot | undefined,
): Record<string, PublicationLibraryInfo> {
  const info: Record<string, PublicationLibraryInfo> = {};

  const add = (
    records: OfflineLibraryRecord[],
    section: OfflineLibrarySection,
    supersededOnly: boolean,
  ) => {
    for (const record of records) {
      const entry: PublicationLibraryInfo = (info[record.canonical_id] ??= {
        primary: null,
        superseded: [],
      });
      const categorized: CategorizedLibraryRecord = { ...record, section };
      if (supersededOnly || !record.is_current_revision) {
        entry.superseded.push(categorized);
        continue;
      }
      if (!entry.primary) {
        entry.primary = categorized;
      } else {
        const currentPriority = SECTION_PRIORITY.indexOf(entry.primary.section);
        const nextPriority = SECTION_PRIORITY.indexOf(section);
        if (nextPriority !== -1 && (currentPriority === -1 || nextPriority < currentPriority)) {
          entry.primary = categorized;
        }
      }
    }
  };

  add(snapshot?.downloading ?? [], "downloading", false);
  add(snapshot?.unavailable ?? [], "unavailable", false);
  add(snapshot?.failed ?? [], "failed", false);
  add(snapshot?.complete ?? [], "complete", false);
  add(snapshot?.superseded ?? [], "superseded", true);

  return info;
}
