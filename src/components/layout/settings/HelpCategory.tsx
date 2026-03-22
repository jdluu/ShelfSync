import type { LucideIcon } from "lucide-react";
import type React from "react";

interface HelpCategoryProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  colorClass?: string;
  bgClass?: string;
}

export const HelpCategory: React.FC<HelpCategoryProps> = ({
  icon: Icon,
  label,
  onClick,
  colorClass = "text-primary",
  bgClass = "bg-primary/10",
}) => {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 p-3 lg:p-4 text-left hover:bg-base-200/50 rounded-xl transition-colors group"
      onClick={onClick}
    >
      <div className={`p-2 ${bgClass} rounded-lg group-hover:scale-110 transition-transform`}>
        <Icon className={`w-4 h-4 ${colorClass}`} />
      </div>
      <span className="text-sm font-medium text-base-content/90 tracking-tight">{label}</span>
    </button>
  );
};
