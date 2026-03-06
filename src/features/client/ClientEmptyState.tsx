import { Library } from "lucide-react";
import type React from "react";

interface ClientEmptyStateProps {
  setActiveTab: (tab: "explore" | "library") => void;
}

export const ClientEmptyState: React.FC<ClientEmptyStateProps> = ({ setActiveTab }) => {
  return (
    <div className="text-center py-24 px-4 bg-base-100 rounded-[2rem] border border-base-content/10 shadow-sm flex flex-col items-center justify-center relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-base-200/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="w-20 h-20 rounded-2xl bg-base-200/80 flex items-center justify-center mb-6 ring-1 ring-base-content/5 group-hover:scale-105 transition-transform duration-300">
        <Library className="w-10 h-10 text-base-content/30 group-hover:text-primary transition-colors duration-300" />
      </div>
      <h3 className="text-2xl font-display font-bold mb-3 tracking-tight">
        Device library is empty
      </h3>
      <p className="text-base-content/60 max-w-sm mx-auto text-sm leading-relaxed mb-8">
        Switch to the Explore tab to find and download books from your host.
      </p>
      <button
        type="button"
        onClick={() => setActiveTab("explore")}
        className="btn btn-primary btn-outline px-8 shadow-sm hover:shadow-md relative z-10 w-full sm:w-auto"
      >
        Browse Books
      </button>
    </div>
  );
};
