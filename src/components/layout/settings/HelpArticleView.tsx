import { ArrowLeft } from "lucide-react";
import type React from "react";

interface HelpArticleViewProps {
  title: string;
  content: React.ReactNode;
  onBack: () => void;
}

export const HelpArticleView: React.FC<HelpArticleViewProps> = ({ title, content, onBack }) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <h3 className="text-lg font-bold text-primary">{title}</h3>
      <div className="text-sm text-base-content/90 leading-relaxed">{content}</div>
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm w-full gap-2 mt-4">
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </button>
    </div>
  );
};
