import { ArrowLeft, Monitor, FileText, Library, Moon, Settings, Sun, User, Wifi, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useLibrary } from "@/contexts/LibraryContext";
import { isMobile, isTauri } from "@/utils/tauri";

interface HelpArticle {
  id: string;
  title: string;
  content: React.ReactNode;
}

const ARTICLES: Record<string, HelpArticle> = {
  select_library: {
    id: "select_library",
    title: "How to select a library?",
    content: (
      <div className="space-y-4">
        <p>
          To start sharing your books, you need to point ShelfSync to your Calibre library folder.
        </p>
        <ol className="list-decimal list-inside space-y-2 text-sm text-base-content/70">
          <li>
            Open the <strong>Host Dashboard</strong>.
          </li>
          <li>
            Click the <strong>Select Folder</strong> button in the Library Selection card.
          </li>
          <li>
            Navigate to your Calibre library (the folder containing{" "}
            <code className="bg-base-300 px-1 rounded">metadata.db</code>).
          </li>
          <li>
            Click <strong>Open/Select</strong>.
          </li>
        </ol>
        <p className="text-sm text-base-content/60 italic">
          Note: ShelfSync requires read access to this folder to index your books.
        </p>
      </div>
    ),
  },
  setup_host: {
    id: "setup_host",
    title: "Setting up your first host",
    content: (
      <div className="space-y-4">
        <p>The Host device acts as the server for your books.</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-base-content/70">
          <li>
            Ensure your Host computer and Client device are on the{" "}
            <strong>same Wi-Fi network</strong>.
          </li>
          <li>Select a library to activate the sharing service.</li>
          <li>
            Once active, a <strong>QR Code</strong> and <strong>Connection Info</strong> will
            appear.
          </li>
          <li>Keep this window open while you connect your client device.</li>
        </ul>
      </div>
    ),
  },
  not_found: {
    id: "not_found",
    title: "Client cannot find host",
    content: (
      <div className="space-y-4">
        <p>If your client can't see the host, try these steps:</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-base-content/70">
          <li>Verify both devices are on the exact same Wi-Fi SSID.</li>
          <li>
            Check that the Host Dashboard shows <strong>"Live Sync"</strong> (Active).
          </li>
          <li>Disable any VPNs on either device, as they can interfere with local discovery.</li>
          <li>
            Use the <strong>"Manual Connect"</strong> option on the client and enter the IP address
            shown on the host.
          </li>
        </ul>
      </div>
    ),
  },
  firewall: {
    id: "firewall",
    title: "Firewall issues",
    content: (
      <div className="space-y-4">
        <p>Windows or MacOS firewalls may block incoming connections.</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-base-content/70">
          <li>
            When you first run ShelfSync, you should see a firewall prompt. Choose{" "}
            <strong>"Allow access"</strong> for Private networks.
          </li>
          <li>Check your antivirus software settings if discovery consistently fails.</li>
          <li>
            The default port is <strong>8080</strong>; ensure this port is not being used by another
            app.
          </li>
        </ul>
      </div>
    ),
  },
  ip_changes: {
    id: "ip_changes",
    title: "IP address changes",
    content: (
      <div className="space-y-4">
        <p>Local IP addresses can change if your router restarts or your device reconnects.</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-base-content/70">
          <li>
            If the client loses connection, check the Host Dashboard for the current{" "}
            <strong>Host IP</strong>.
          </li>
          <li>
            Most modern routers will keep your IP the same, but it's the first thing to check if
            sync stops working.
          </li>
        </ul>
      </div>
    ),
  },
  add_books: {
    id: "add_books",
    title: "Adding new books",
    content: (
      <div className="space-y-4">
        <p>ShelfSync reads your Calibre database directly.</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-base-content/70">
          <li>Add your new books to Calibre as usual.</li>
          <li>
            Once Calibre has updated its database, ShelfSync will pick up the changes on the next
            refresh or restart.
          </li>
          <li>Connected clients will see the new books immediately in their "Home" view.</li>
        </ul>
      </div>
    ),
  },
  sync_metadata: {
    id: "sync_metadata",
    title: "Syncing metadata",
    content: (
      <div className="space-y-4">
        <p>Metadata includes titles, authors, series info, and covers.</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-base-content/70">
          <li>Metadata is synced automatically every time you browse the library.</li>
          <li>
            If a cover is missing, ensure the image file exists in the Calibre folder on the host.
          </li>
        </ul>
      </div>
    ),
  },
  delete_books: {
    id: "delete_books",
    title: "Deleting books",
    content: (
      <div className="space-y-4">
        <p>Management must be done on the Host computer.</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-base-content/70">
          <li>
            Deleting a book from the Client Dashboard only removes the{" "}
            <strong>offline copy</strong> from your mobile device.
          </li>
          <li>To permanently remove a book from the library, use Calibre on your Host computer.</li>
        </ul>
      </div>
    ),
  },
};

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onChangeRole?: () => void;
  hostIp?: string;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ isOpen, onClose, onChangeRole, hostIp }) => {
  const { appMode, offlineStoragePath, selectOfflineStorageFolder } = useLibrary();
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(
    (localStorage.getItem("theme-preference") as "light" | "dark" | "system") || "system",
  );

  const applyTheme = (t: "light" | "dark" | "system") => {
    let effectiveTheme: "light" | "dark";
    if (t === "system") {
      effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } else {
      effectiveTheme = t;
    }
    const documentElement = document.documentElement;
    documentElement.setAttribute("data-theme", effectiveTheme);
    localStorage.setItem("theme-preference", t);

    // Update system theme color for mobile status bars/etc
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", effectiveTheme === "dark" ? "#1d232a" : "#ffffff");
    }
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute("data-theme") as "light" | "dark";
      // Only sync back if not in system mode (to avoid infinite loops or clashing)
      if (theme !== "system" && currentTheme && currentTheme !== theme) {
        setTheme(currentTheme);
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [theme]);

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
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-4 sm:p-6">
          {activeArticle ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-bold text-primary">{activeArticle.title}</h3>
              <div className="text-sm text-base-content/90 leading-relaxed">{activeArticle.content}</div>
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
              {/* Appearance Section */}
              <section>
                <h3 className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest mb-3">Appearance</h3>
                <div className="flex flex-col gap-3 p-1 bg-base-200/50 rounded-xl border border-base-300">
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className={`flex flex-col items-center gap-2 py-3 px-2 rounded-lg transition-all ${
                        theme === "light" 
                          ? "bg-base-100 shadow-sm text-primary" 
                          : "hover:bg-base-200 text-base-content/60"
                      }`}
                    >
                      <Sun className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase">Light</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className={`flex flex-col items-center gap-2 py-3 px-2 rounded-lg transition-all ${
                        theme === "dark" 
                          ? "bg-base-100 shadow-sm text-primary" 
                          : "hover:bg-base-200 text-base-content/60"
                      }`}
                    >
                      <Moon className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase">Dark</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("system")}
                      className={`flex flex-col items-center gap-2 py-3 px-2 rounded-lg transition-all ${
                        theme === "system" 
                          ? "bg-base-100 shadow-sm text-primary" 
                          : "hover:bg-base-200 text-base-content/60"
                      }`}
                    >
                      <Monitor className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase">System</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* Roles Section */}
              {onChangeRole && (
                <section>
                  <h3 className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest mb-3">Session</h3>
                  
                  {/* Offline Storage Section (Client Mode + Desktop only) */}
                  {appMode === "client" && (
                    <div className="flex flex-col gap-4 p-4 bg-base-200/50 rounded-xl border border-base-300 mb-3">
                      <div className="flex justify-between items-center">
                        <div className="flex-grow overflow-hidden mr-2">
                          <p className="font-bold text-sm">Offline Storage</p>
                          <p className="text-[10px] text-base-content/50 truncate" title={offlineStoragePath || "Default Cache"}>
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
                <h3 className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest mb-3">Support & Help</h3>
                <div className="grid grid-cols-1 gap-2">
                  <button 
                    className="flex items-center gap-3 p-3 text-left hover:bg-base-200 rounded-lg transition-colors group"
                    onClick={() => setActiveArticleId("setup_host")}
                  >
                    <Wifi className="w-4 h-4 text-success" />
                    <span className="text-sm font-medium">Setting up Host</span>
                  </button>
                  <button 
                    className="flex items-center gap-3 p-3 text-left hover:bg-base-200 rounded-lg transition-colors group"
                    onClick={() => setActiveArticleId("select_library")}
                  >
                    <Library className="w-4 h-4 text-info" />
                    <span className="text-sm font-medium">Selecting Library</span>
                  </button>
                  <button 
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
                  <h4 className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest">System Information</h4>
                  <div className="space-y-1">
                    {hostIp && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-base-content/50 uppercase">Host IP</span>
                        <span className="text-[10px] font-mono font-bold text-base-content/70">{hostIp}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-base-content/50 uppercase">Version</span>
                      <span className="text-[10px] font-mono font-bold text-base-content/70">1.0.0 (Stable)</span>
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
