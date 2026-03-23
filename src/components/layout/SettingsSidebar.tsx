import { requestPermission } from "@tauri-apps/plugin-notification";
import { ArrowLeft, FileText, Library, Settings, Shield, User, Wifi, X } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { useLibraryStore } from "@/store/libraryStore";
import { useToastStore } from "@/store/toastStore";
import { isTauri } from "@/utils/tauri";
import { ARTICLES } from "./help/helpArticles";
import { HelpArticleView } from "./settings/HelpArticleView";
import { HelpCategory } from "./settings/HelpCategory";
import { SettingsSection } from "./settings/SettingsSection";
import { SystemInfo } from "./settings/SystemInfo";
import { ThemeSwitcher } from "./ThemeSwitcher";

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onChangeRole?: () => void;
  hostIp?: string;
}

/**
 * Full-height sidebar panel for application settings, help articles, and system info.
 */
export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  isOpen,
  onClose,
  onChangeRole,
  hostIp,
}) => {
  const { appMode, offlineStoragePath, selectOfflineStorageFolder, eInkMode, setEInkMode } =
    useLibraryStore();
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);

  const handleClose = () => {
    onClose();
    setTimeout(() => setActiveArticleId(null), 300);
  };

  const activeArticle = useMemo(
    () => (activeArticleId ? ARTICLES[activeArticleId] : null),
    [activeArticleId],
  );

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
            <HelpArticleView
              title={activeArticle.title}
              content={activeArticle.content}
              onBack={() => setActiveArticleId(null)}
            />
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-300">
              <ThemeSwitcher />

              <SettingsSection title="Display">
                <div className="flex flex-col gap-4 p-4 lg:p-5 bg-base-100/80 rounded-2xl border border-base-content/5 shadow-sm mb-3 group hover:shadow-md transition-all duration-300 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-base-200/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="flex justify-between items-center relative z-10">
                    <div className="flex-grow overflow-hidden mr-3">
                      <p className="font-bold text-sm tracking-tight text-base-content/90">
                        E-Ink Optimization
                      </p>
                      <p className="text-[11px] text-base-content/50 mt-0.5">
                        High contrast, disables animations
                      </p>
                    </div>
                    <label className="swap shrink-0">
                      <input
                        type="checkbox"
                        checked={eInkMode}
                        onChange={(e) => setEInkMode(e.target.checked)}
                      />
                      <div className="swap-on btn btn-sm btn-active shrink-0 px-4">On</div>
                      <div className="swap-off btn btn-sm btn-outline border-base-content/10 hover:border-primary shrink-0 px-4">
                        Off
                      </div>
                    </label>
                  </div>
                </div>
              </SettingsSection>

              {onChangeRole && (
                <SettingsSection title="Session">
                  {appMode === "client" && (
                    <div className="flex flex-col gap-4 p-4 lg:p-5 bg-base-100/80 rounded-2xl border border-base-content/5 shadow-sm mb-3 group hover:shadow-md transition-all duration-300 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-base-200/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="flex justify-between items-center relative z-10">
                        <div className="flex-grow overflow-hidden mr-3">
                          <p className="font-bold text-sm tracking-tight text-base-content/90">
                            Offline Storage
                          </p>
                          <p
                            className="text-[11px] text-base-content/50 truncate font-mono mt-0.5"
                            title={offlineStoragePath || "Default Cache"}
                          >
                            {offlineStoragePath || "Default Cache"}
                          </p>
                        </div>
                        {isTauri() && (
                          <button
                            type="button"
                            onClick={selectOfflineStorageFolder}
                            className="btn btn-sm btn-outline border-base-content/10 hover:border-primary shrink-0"
                          >
                            Change
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="w-full relative overflow-hidden group flex items-center justify-between p-4 lg:p-5 bg-base-100/80 rounded-2xl border border-base-content/5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
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
                </SettingsSection>
              )}

              <SettingsSection title="Support & Help">
                <div className="bg-base-100/80 p-2 rounded-2xl border border-base-content/5 shadow-sm space-y-1">
                  <HelpCategory
                    icon={Wifi}
                    label="Setting up Host"
                    onClick={() => setActiveArticleId("setup_host")}
                    colorClass="text-success"
                    bgClass="bg-success/10"
                  />
                  <HelpCategory
                    icon={Library}
                    label="Selecting Library"
                    onClick={() => setActiveArticleId("select_library")}
                    colorClass="text-info"
                    bgClass="bg-info/10"
                  />
                  <HelpCategory
                    icon={Settings}
                    label="Troubleshooting"
                    onClick={() => setActiveArticleId("not_found")}
                    colorClass="text-warning"
                    bgClass="bg-warning/10"
                  />
                  <HelpCategory
                    icon={Shield}
                    label="Permissions"
                    onClick={() => setActiveArticleId("permissions")}
                    colorClass="text-accent"
                    bgClass="bg-accent/10"
                  />
                </div>
              </SettingsSection>

              {isTauri() && (
                <SettingsSection title="Permissions">
                  <div className="flex flex-col gap-4 p-4 lg:p-5 bg-base-100/80 rounded-2xl border border-base-content/5 shadow-sm group hover:shadow-md transition-all duration-300 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-base-200/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="flex justify-between items-center relative z-10">
                      <div>
                        <p className="font-bold text-sm text-base-content/90 tracking-tight">
                          Notifications
                        </p>
                        <p className="text-[11px] text-base-content/50 mt-0.5">
                          Required for sync alerts
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await requestPermission();
                          if (res === "granted") {
                            useToastStore
                              .getState()
                              .addToast("Notification permission granted!", "success");
                          } else {
                            useToastStore.getState().addToast("Permission denied.", "error");
                          }
                        }}
                        className="btn btn-sm btn-outline border-base-content/10 hover:border-primary shrink-0"
                      >
                        Request
                      </button>
                    </div>
                  </div>
                </SettingsSection>
              )}

              <section className="pt-4 border-t border-base-300">
                <SystemInfo hostIp={hostIp} />
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-4 border-t border-t-base-300 bg-base-200/40"
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
