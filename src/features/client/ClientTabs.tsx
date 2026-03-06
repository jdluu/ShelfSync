import type React from "react";

interface ClientTabsProps {
  activeTab: "explore" | "library";
  setActiveTab: (tab: "explore" | "library") => void;
}

export const ClientTabs: React.FC<ClientTabsProps> = ({ activeTab, setActiveTab }) => {
  return (
    <div className="flex justify-center mb-8">
      <div className="bg-base-200/80 backdrop-blur-md p-1.5 rounded-2xl flex items-center relative shadow-inner border border-base-content/5 w-full max-w-sm">
        <div
          className="absolute inset-y-1.5 w-[calc(50%-0.375rem)] bg-base-100 rounded-xl shadow-sm border border-base-content/5 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-0"
          style={{
            transform: activeTab === "explore" ? "translateX(0)" : "translateX(100%)",
          }}
        />
        <button
          type="button"
          onClick={() => setActiveTab("explore")}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-colors duration-300 z-10 ${
            activeTab === "explore"
              ? "text-primary"
              : "text-base-content/50 hover:text-base-content/80"
          }`}
        >
          Explore
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("library")}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-colors duration-300 z-10 ${
            activeTab === "library"
              ? "text-primary"
              : "text-base-content/50 hover:text-base-content/80"
          }`}
        >
          My Library
        </button>
      </div>
    </div>
  );
};
