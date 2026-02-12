import { HelpCircle, Library, Moon, Sun } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { HelpSidebar } from "./HelpSidebar";

interface HeaderProps {
  title: string;
  onChangeRole?: () => void;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, onChangeRole, actions }) => {
  const [theme, setTheme] = useState<"light" | "dark">(
    (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "dark",
  );
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  useEffect(() => {
    // Sync with attribute if changed externally (e.g. system preference)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "data-theme") {
          const newTheme = document.documentElement.getAttribute("data-theme") as "light" | "dark";
          if (newTheme && newTheme !== theme) {
            setTheme(newTheme);
          }
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [theme]);

  return (
    <>
      <header className="navbar bg-base-100 border-b border-base-300 px-6 py-4 flex justify-between items-center h-16 sticky top-0 z-[1000]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Library className="w-8 h-8 text-primary" />
            <span className="text-2xl font-bold tracking-tight">ShelfSync</span>
          </div>
          <div className="h-8 w-px bg-base-300 mx-2 hidden sm:block"></div>
          <span className="text-lg font-medium text-base-content/80 hidden sm:block">{title}</span>
        </div>

        <div className="flex items-center gap-3">
          {actions}
          {onChangeRole && (
            <button
              type="button"
              onClick={onChangeRole}
              className="btn btn-primary btn-sm px-2 sm:px-4 font-semibold shadow-sm"
            >
              <span className="hidden xs:inline">Change Role</span>
              <span className="xs:hidden">Role</span>
            </button>
          )}

          <div className="flex items-center gap-0 sm:gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="btn btn-ghost btn-sm btn-circle"
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                <Moon className="w-5 h-5 text-base-content/70" />
              ) : (
                <Sun className="w-5 h-5 text-base-content/70" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              className="btn btn-ghost btn-sm gap-2 font-medium opacity-70 hover:opacity-100"
            >
              <HelpCircle className="w-5 h-5" />
              <span className="hidden md:inline">Help</span>
            </button>
          </div>
        </div>
      </header>

      <HelpSidebar isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
};
