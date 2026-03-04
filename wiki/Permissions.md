# Permissions

ShelfSync is designed to operate seamlessly across different devices while respecting your privacy and security. To achieve its core functionality, the application requests specific permissions depending on whether it is running as a Host or a Client.

## 1. Local Network Access

### Why it's needed
ShelfSync utilizes Multicast DNS (mDNS) to automatically discover other devices running the application on your local Wi-Fi network. This allows the Client to find the Host without requiring you to manually type in IP addresses. It also enables the direct transfer of books without routing your data through an external internet server.

### When it's requested
*   **Desktop (Windows/Linux/macOS):** Upon first launch or first attempt to bind the server port, your operating system firewall may prompt you to allow ShelfSync to communicate on private networks.
*   **Mobile (Android/iOS):** Depending on the OS version, you may be prompted to grant "Local Network" access when the application attempts to scan for hosts.

## 2. Storage and File Access

### Why it's needed
*   **Host Mode:** The application needs read-only access to your Calibre library directory. This is necessary to parse the `metadata.db` file and serve the actual book files (`.epub`, `.pdf`, etc.) and cover images to connected clients.
*   **Client Mode:** When you synchronize (download) books from the Host, ShelfSync must save these files to your device's persistent offline storage so you can read them later without a network connection.

### When it's requested
*   **Desktop:** Handled natively when you use the file picker dialog to select your Calibre library or offline storage location.
*   **Mobile:** You may be prompted to grant file or media access permissions to the application so it can save downloaded books.

## 3. Notifications

### Why it's needed
Instead of requiring you to stare at a progress bar, ShelfSync uses system notifications to alert you when a large batch of books has finished synchronizing, or if an error occurred during the transfer.

### When it's requested
*   You will explicitly see a prompt within the Settings Sidebar under the "Permissions" section, allowing you to opt-in to system notifications.
*   If you do not grant this permission, ShelfSync will fall back to using in-app "toast" messages instead.

## Privacy Note
ShelfSync does not collect analytics, and all book transfers happen directly between your own devices over your local area network. Your data never leaves your home.
