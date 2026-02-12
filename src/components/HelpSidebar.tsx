import { ArrowLeft, BookOpen, FileText, Library, Wifi, X } from "lucide-react";
import type React from "react";
import { useState } from "react";

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
            The default port is <strong>1422</strong>; ensure this port is not being used by another
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
            <strong>offline replica</strong> from your mobile device.
          </li>
          <li>To permanently remove a book from the library, use Calibre on your Host computer.</li>
        </ul>
      </div>
    ),
  },
};

interface HelpSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpSidebar: React.FC<HelpSidebarProps> = ({ isOpen, onClose }) => {
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);

  const handleClose = () => {
    onClose();
    // Reset to list view after a delay so the transition is smooth
    setTimeout(() => setActiveArticleId(null), 300);
  };

  const activeArticle = activeArticleId ? ARTICLES[activeArticleId] : null;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close sidebar"
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={handleClose}
      />

      {/* Sidebar */}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-80 bg-base-100 shadow-2xl z-[2001] transition-transform duration-300 border-l border-base-300 flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-base-300 flex items-center justify-between bg-base-200/50">
          <div className="flex items-center gap-2">
            {activeArticleId && (
              <button
                type="button"
                onClick={() => setActiveArticleId(null)}
                className="btn btn-ghost btn-xs btn-circle mr-1"
                title="Back to Help Topics"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-2xl font-bold tracking-tight">
              {activeArticleId ? "Help Article" : "ShelfSync Help"}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-ghost btn-sm btn-circle hover:bg-base-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-4">
          {activeArticle ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-bold text-primary">{activeArticle.title}</h3>
              <div className="text-base-content/90 leading-relaxed">{activeArticle.content}</div>
              <button
                type="button"
                onClick={() => setActiveArticleId(null)}
                className="btn btn-outline btn-sm w-full gap-2 mt-8"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Topics
              </button>
            </div>
          ) : (
            <div className="space-y-2 animate-in fade-in slide-in-from-left-4 duration-300">
              {/* Getting Started */}
              <div className="collapse collapse-arrow bg-base-200/30 border border-base-300/50 rounded-xl">
                <input type="radio" name="help-accordion" defaultChecked />
                <div className="collapse-title flex items-center gap-4 py-4 pr-12">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <span className="font-bold">Getting Started</span>
                </div>
                <div className="collapse-content px-14 pb-4">
                  <ul className="space-y-3 pt-2">
                    <li>
                      <button
                        type="button"
                        onClick={() => setActiveArticleId("select_library")}
                        className="text-sm text-base-content/70 hover:text-primary transition-colors text-left w-full"
                      >
                        How to select a library?
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setActiveArticleId("setup_host")}
                        className="text-sm text-base-content/70 hover:text-primary transition-colors text-left w-full"
                      >
                        Setting up your first host
                      </button>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Troubleshooting */}
              <div className="collapse collapse-arrow bg-base-200/30 border border-base-300/50 rounded-xl">
                <input type="radio" name="help-accordion" />
                <div className="collapse-title flex items-center gap-4 py-4 pr-12">
                  <div className="p-2 bg-success/10 rounded-lg text-success">
                    <Wifi className="w-5 h-5" />
                  </div>
                  <span className="font-bold">Troubleshooting Connection</span>
                </div>
                <div className="collapse-content px-14 pb-4">
                  <ul className="space-y-3 pt-2 text-sm text-base-content/70">
                    <li>
                      <button
                        type="button"
                        onClick={() => setActiveArticleId("not_found")}
                        className="hover:text-primary transition-colors text-left w-full"
                      >
                        Client cannot find host
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setActiveArticleId("firewall")}
                        className="hover:text-primary transition-colors text-left w-full"
                      >
                        Firewall issues
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setActiveArticleId("ip_changes")}
                        className="hover:text-primary transition-colors text-left w-full"
                      >
                        IP address changes
                      </button>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Library Management */}
              <div className="collapse collapse-arrow bg-base-200/30 border border-base-300/50 rounded-xl">
                <input type="radio" name="help-accordion" />
                <div className="collapse-title flex items-center gap-4 py-4 pr-12">
                  <div className="p-2 bg-warning/10 rounded-lg text-warning">
                    <Library className="w-5 h-5" />
                  </div>
                  <span className="font-bold">Library Management</span>
                </div>
                <div className="collapse-content px-14 pb-4">
                  <ul className="space-y-3 pt-2 text-sm text-base-content/70">
                    <li>
                      <button
                        type="button"
                        onClick={() => setActiveArticleId("add_books")}
                        className="hover:text-primary transition-colors text-left w-full"
                      >
                        Adding new books
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setActiveArticleId("sync_metadata")}
                        className="hover:text-primary transition-colors text-left w-full"
                      >
                        Syncing metadata
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => setActiveArticleId("delete_books")}
                        className="hover:text-primary transition-colors text-left w-full"
                      >
                        Deleting books
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-base-300 bg-base-200/40 flex flex-col gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm justify-start gap-3 opacity-70 hover:opacity-100 group"
          >
            <FileText className="w-4 h-4 group-hover:text-primary" />
            <span className="text-xs font-semibold">Full Documentation</span>
          </button>
        </div>
      </aside>
    </>
  );
};
