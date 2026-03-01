import { ArrowLeft, FileText, Library, Settings, User, Wifi, X } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useLibraryStore } from "@/store/libraryStore";
import { isMobile, isTauri } from "@/utils/tauri";
import { ARTICLES } from "./help/helpArticles";
import { ThemeSwitcher } from "./ThemeSwitcher";

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onChangeRole?: () => void;
  hostIp?: string;
}

/**
 * Full-height sidebar panel for application settings, help articles, and system info.
 *
 * Slides in from the right edge. Contains:
 * - Theme switcher (via `ThemeSwitcher`)
 * - Session management (offline storage, role switching)
 * - Support & Help (article browser)
 * - System information (host IP, version)
 */
export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  isOpen,
  onClose,
  onChangeRole,
  hostIp,
}) => {
  const { appMode, offlineStoragePath, selectOfflineStorageFolder } = useLibraryStore();
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);

  const handleClose = () => {
    onClose();
    setTimeout(() => setActiveArticleId(null), 300);
  };

  const activeArticle = activeArticleId ? ARTICLES[activeArticleId] : null;

  return (
    <>
      <button
        type="button"
        aria-label="Close settings"
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={handleClose}
      />

      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-85 bg-base-100 shadow-2xl z-[2001] transition-transform duration-300 border-l border-base-300 flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div
          className="p-4 sm:p-6 border-b border-base-300 flex items-center justify-between bg-base-200/50"
          style={{ paddingTop: "calc(var(--safe-area-top, 0px) + 1.5rem)" }}
        >
          <div className="flex items-center gap-2">
            {activeArticleId && (
              <button
                type="button"
                onClick={() => setActiveArticleId(null)}
                className="btn btn-ghost btn-xs btn-circle mr-1"
                aria-label="Back to settings"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {activeArticleId ? "Help Article" : "Settings"}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-ghost btn-sm btn-circle"
            aria-label="Close settings"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-4 sm:p-6">
          {activeArticle ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-bold text-primary">{activeArticle.title}</h3>
              <div className="text-sm text-base-content/90 leading-relaxed">
                {activeArticle.content}
              </div>
              <button
                type="button"
                onClick={() => setActiveArticleId(null)}
                className="btn btn-ghost btn-sm w-full gap-2 mt-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Settings
              </button>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-300">
              <ThemeSwitcher />

              {/* Roles Section */}
              {onChangeRole && (
                <section>
                  <h3 className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest mb-3">
                    Session
                  </h3>

                  {/* Offline Storage Section (Client Mode + Desktop only) */}
                  {appMode === "client" && (
                    <div className="flex flex-col gap-4 p-4 bg-base-200/50 rounded-xl border border-base-300 mb-3">
                      <div className="flex justify-between items-center">
                        <div className="flex-grow overflow-hidden mr-2">
                          <p className="font-bold text-sm">Offline Storage</p>
                          <p
                            className="text-[10px] text-base-content/50 truncate"
                            title={offlineStoragePath || "Default Cache"}
                          >
                            {offlineStoragePath || "Default Cache"}
                          </p>
                        </div>
                        {isTauri() && !isMobile() && (
                          <button
                            type="button"
                            onClick={selectOfflineStorageFolder}
                            className="btn btn-xs btn-outline border-base-300"
                          >
                            Change
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="w-full flex items-center justify-between p-4 bg-base-200/50 rounded-xl border border-base-300 hover:bg-base-200 transition-colors"
                    onClick={() => {
                      handleClose();
                      onChangeRole();
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-secondary/10 rounded-lg text-secondary">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-sm">Switch Role</p>
                        <p className="text-xs text-base-content/50">Return to role selection</p>
                      </div>
                    </div>
                    <ArrowLeft className="w-4 h-4 rotate-180 opacity-30" />
                  </button>
                </section>
              )}

              {/* Help Section */}
              <section>
                <h3 className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest mb-3">
                  Support & Help
                </h3>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-3 p-3 text-left hover:bg-base-200 rounded-lg transition-colors group"
                    onClick={() => setActiveArticleId("setup_host")}
                  >
                    <Wifi className="w-4 h-4 text-success" />
                    <span className="text-sm font-medium">Setting up Host</span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-3 p-3 text-left hover:bg-base-200 rounded-lg transition-colors group"
                    onClick={() => setActiveArticleId("select_library")}
                  >
                    <Library className="w-4 h-4 text-info" />
                    <span className="text-sm font-medium">Selecting Library</span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-3 p-3 text-left hover:bg-base-200 rounded-lg transition-colors group"
                    onClick={() => setActiveArticleId("not_found")}
                  >
                    <Settings className="w-4 h-4 text-warning" />
                    <span className="text-sm font-medium">Troubleshooting</span>
                  </button>
                </div>
              </section>

              {/* About Section */}
              <section className="pt-4 border-t border-base-300">
                <div className="flex flex-col gap-2 p-4 bg-base-200/30 rounded-xl border border-dashed border-base-300">
                  <h4 className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest">
                    System Information
                  </h4>
                  <div className="space-y-1">
                    {hostIp && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-base-content/50 uppercase">Host IP</span>
                        <span className="text-[10px] font-mono font-bold text-base-content/70">
                          {hostIp}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-base-content/50 uppercase">Version</span>
                      <span className="text-[10px] font-mono font-bold text-base-content/70">
                        1.0.0 (Stable)
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-4 border-t border-base-300 bg-base-200/40"
          style={{ paddingBottom: "calc(var(--safe-area-bottom, 0px) + 1.5rem)" }}
        >
          <a
            href="https://github.com/jdluu/ShelfSync/wiki"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm w-full justify-between group"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 group-hover:text-primary" />
              <span className="text-xs font-semibold">Full Documentation</span>
            </div>
            <ArrowLeft className="w-3 h-3 rotate-180 opacity-50" />
          </a>
        </div>
      </aside>
    </>
  );
};
