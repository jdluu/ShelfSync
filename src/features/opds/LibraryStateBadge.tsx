import { CloudOff, Download, DownloadCloud, History, RefreshCw } from "lucide-react";
import type React from "react";
import type { CategorizedLibraryRecord } from "@/types/offline";

interface LibraryStateBadgeProps {
  record: CategorizedLibraryRecord;
}

const SECTION_LABELS: Record<CategorizedLibraryRecord["section"], string> = {
  complete: "Downloaded",
  downloading: "Downloading",
  failed: "Download failed",
  unavailable: "Removed from server",
  superseded: "Older copy",
};

const SECTION_BADGE_CLASSES: Record<CategorizedLibraryRecord["section"], string> = {
  complete: "badge-success",
  downloading: "badge-info",
  failed: "badge-error",
  unavailable: "badge-warning",
  superseded: "badge-ghost",
};

export const librarySectionLabel = (section: CategorizedLibraryRecord["section"]): string => {
  return SECTION_LABELS[section];
};

export const LibraryStateBadge: React.FC<LibraryStateBadgeProps> = ({ record }) => {
  const icon =
    record.section === "unavailable" ? (
      <CloudOff className="w-3 h-3" aria-hidden="true" />
    ) : record.section === "downloading" ? (
      <DownloadCloud className="w-3 h-3" aria-hidden="true" />
    ) : record.section === "superseded" ? (
      <History className="w-3 h-3" aria-hidden="true" />
    ) : record.section === "failed" ? (
      <RefreshCw className="w-3 h-3" aria-hidden="true" />
    ) : (
      <Download className="w-3 h-3" aria-hidden="true" />
    );

  return (
    <span
      data-testid={`library-badge-${record.section}`}
      className={`badge badge-sm gap-1 ${SECTION_BADGE_CLASSES[record.section]}`}
    >
      {icon}
      {SECTION_LABELS[record.section]}
    </span>
  );
};
