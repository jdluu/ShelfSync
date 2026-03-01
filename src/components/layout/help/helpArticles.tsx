import type React from "react";

/**
 * Shape of a help article displayed in the Settings sidebar.
 */
export interface HelpArticle {
  id: string;
  title: string;
  content: React.ReactNode;
}

/**
 * Static help article content shown in the Settings sidebar.
 *
 * Each article covers a common user question about ShelfSync's setup,
 * connectivity, or library management.
 */
export const ARTICLES: Record<string, HelpArticle> = {
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
        <p className="text-sm text-base-content/70 italic">
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
            Use the <strong>"Manual Connection"</strong> option on the client and enter the IP
            address shown on the host.
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
        <p>Windows or Linux firewalls may block incoming connections.</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-base-content/70">
          <li>
            When you first run ShelfSync, you should see a firewall prompt. Choose{" "}
            <strong>"Allow access"</strong> for Private networks.
          </li>
          <li>Check your antivirus software settings if discovery consistently fails.</li>
          <li>
            Ensure the port displayed on the Host Dashboard is not being blocked by another app or
            firewall rule.
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
          <li>
            Connected clients will see the new books immediately in their "Available Books" view.
          </li>
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
            <strong>offline storage copy</strong> from your mobile device.
          </li>
          <li>To permanently remove a book from the library, use Calibre on your Host computer.</li>
        </ul>
      </div>
    ),
  },
  browse_and_sync: {
    id: "browse_and_sync",
    title: "Browsing and Bulk Syncing",
    content: (
      <div className="space-y-4">
        <p>ShelfSync makes it easy to navigate large libraries and download entire collections.</p>
        <ul className="list-disc list-inside space-y-2 text-sm text-base-content/70">
          <li>
            Use the <strong>Group By</strong> chips (Series, Author, Tag, All) in the client toolbar
            to organize your view.
          </li>
          <li>
            When grouping by Series, Author, or Tag, you can use the <strong>Select All</strong> or{" "}
            <strong>Sync All</strong> buttons on the group header to download the entire group at
            once.
          </li>
          <li>
            You can also use the <strong>Selection Mode</strong> (using the checkmark icon in the
            header) to manually pick multiple specific books to sync.
          </li>
        </ul>
      </div>
    ),
  },
};
