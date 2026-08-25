import { Settings as SettingsIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { SettingsSidebar } from "./SettingsSidebar";

interface HeaderProps {
  title: string;
  onChangeRole?: () => void;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, onChangeRole, actions }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <header
        className="navbar bg-base-100 border-b border-base-300 px-3 sm:px-6 py-3 sm:py-4 flex justify-between items-center sticky top-0 z-[1000]"
        style={{ paddingTop: "calc(var(--safe-area-top, 0px) + 0.75rem)" }}
      >
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <BrandLogo size="md" className="shrink-0" />
            <span className="font-display text-xl sm:text-2xl font-semibold tracking-tight hidden xs:block">
              ShelfSync
            </span>
          </div>
          <div className="h-6 w-px bg-base-300 mx-1 hidden sm:block"></div>
          <span className="text-sm font-medium text-base-content/60 hidden sm:block">{title}</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
          {actions}

          {onChangeRole && (
            <button
              type="button"
              onClick={onChangeRole}
              className="btn btn-ghost btn-sm font-medium hover:bg-base-200 hidden xs:inline-flex"
            >
              Change Role
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="btn btn-ghost btn-sm btn-circle hover:bg-base-200"
            aria-label="Settings"
          >
            <SettingsIcon className="w-5 h-5 opacity-70" />
          </button>
        </div>
      </header>

      <SettingsSidebar
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onChangeRole={onChangeRole}
      />
    </>
  );
};
