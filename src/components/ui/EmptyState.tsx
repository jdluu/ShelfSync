import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 gap-4 text-center bg-base-200/50 rounded-2xl border-2 border-dashed border-base-300 w-full">
      <Icon className="w-12 h-12 text-base-content/50" />
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-base-content/70 max-w-[300px]">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn btn-sm btn-outline btn-primary mt-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
