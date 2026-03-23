# Changelog

All notable changes to this project will be documented in this file.

## [1.3.2] - 2026-03-22
### Added
- **Visual Activity Preview**: Introduced a "Recent Activity" monitor on the Host Dashboard to better visualize incoming device connections and synchronization status.

### Changed
- **Modern Confirmation Flow**: Replaced outdated browser pop-ups with smooth, interactive inline confirmation buttons for book downloads and removals.
- **Adaptive Sync Progress**: Redesigned the progress overlay to fluidly snap to the bottom of the screen on mobile devices, providing a more native-feeling experience.
- **Layout Consistency Improvements**: Standardized dashboard widths across all devices to ensure a premium, centered viewing experience on larger monitors.

## [1.3.1] - 2026-03-22
### Added
- **Interactive Connection Feedback**: Added "Connecting..." states and real-time notifications for manual IP connections.
- **Host Readiness Validation**: The client now verifies if the host has a library properly configured before confirming a connection.
- **Discovery Troubleshooting**: Integrated a comprehensive troubleshooting guide within the Discovery UI.
- **Host-Side Pairing Alerts**: The host machine now displays a system notification when a new device successfully pairs.
- **Visual Discovery Status**: Added an animated status indicator to the Host Dashboard.

### Fixed
- **Virtual Adapter Interference**: Optimized network discovery to ignore virtual interfaces (WSL, Docker, VPNs).
- **Manual IP Reliability**: Resolved cases where manual IP entries would silently fail.

## [1.3.0] - 2026-03-22
    
### Added
- **Intelligent Background Sync**: Android devices now feature a persistent sync engine. Your books will continue to download and sync even when the app is minimized or the screen is off.
- **Full-Text Library Search**: Rapidly find books by searching through their entire text content, in addition to titles and authors.
- **E-Ink Display Optimization**: Introduced a specialized high-contrast mode for E-Ink devices, featuring reduced animations and sharpened typography for a superior reading experience.
- **3D Interactive Gallery**: A new immersive way to browse your featured collections with a responsive 3D cover flow view.
- **Smart Device Discovery**: Enhanced Bluetooth-assisted discovery as a secondary fallback to ensure your devices find each other instantly on any network.

### Changed
- **Polished Visual Identity**: Refreshed the entire application with the official ShelfSync branding and high-fidelity icons across the desktop tray, taskbar, and mobile UI.
- **Streamlined Settings**: Redesigned the settings and help panels into a clearer, modular layout for easier navigation.
- **Superior Animation Performance**: Optimized all visual transitions to be smoother and more battery-efficient, especially on mobile hardware.

### Fixed
- **Rock-Solid Connectivity**: Resolved edge cases where devices could lose connection during long synchronization sessions.
- **Universal Icon Consistency**: Fixed an issue where generic icons would appear in certain system menus or when the app was minimized.

## [1.2.0] - 2026-03-15

### Added
- **Smart Connection Persistence**: The app now accurately remembers the correct network port even if it changes between sessions, making discovery more reliable.
- **Enhanced Sync Reliability**: Implemented automatic retries for book downloads. If your Wi-Fi drops momentarily, the app will now pause and try again instead of failing the sync.
- **Auto-Refreshing Library**: The host now automatically detects changes to your Calibre library. If you add a book in Calibre, it will show up on your other devices without needing a restart.

### Changed
- **Major Performance Boost**: Optimized how the app reads and stores book information. Browsing and syncing large libraries is now significantly faster and more battery-efficient on mobile devices.
- **Improved Space Management**: When you remove a book from your device, the app now proactively cleans up all associated files, including covers and hidden metadata, to keep your storage organized.
- **Faster Image Loading**: Improved how book covers are processed and cached, reducing wait times and data usage when scrolling through your library.

### Fixed
- **Security Hardening**: Added protection against unauthorized access attempts on your local network and strengthened how the app handles file paths to ensure your data stays safe.
- **Data Integrity**: Fixed a rare issue where syncing multiple batches of books at once could show incorrect progress or miss books.
- **Modern Infrastructure**: Fully updated all underlying system libraries to the latest stable versions for better long-term stability and compatibility.

## [1.1.3] - 2026-03-05

### Changed
- **Performance & Stability**: Upgraded internal state management and completely reworked screen rendering for the Client Dashboard. Navigating your library should now feel noticeably smoother and consume fewer system resources.
- **Code Health**: Resolved underlying architectural and linting issues identified by code quality tools to ensure a more resilient and maintainable app.
- **Settings & Config**: Refined component structures and internal security configurations to guarantee reliable connections and offline features.

## [1.1.2] - 2026-03-03

### Changed
- **Performance**: Significant improvements to initial application load times and smoother navigation between dashboards.
- **Documentation**: Added an "App Permissions Explained" article to the in-app Help Sidebar to clarify why local network and file access are needed.

## [1.1.1] - 2026-03-03

### Fixed
- **Android Folder Selection**: Implemented a reliable workaround for choosing storage and library locations on Android using a "Save As" dialog hack.
- **UI Consistency**: Updated version displays and finalized theme transitions for the 1.1.1 stable release.

## [1.1.0] - 2026-03-02

### Added
- **Delete from Device**: You can now remove downloaded books from your device to free up space while keeping them in your remote library.
- **Smart Storage Setup**: The app now proactively helps you set up a download folder on new installs.
- **Expanded Metadata**: Offline books now show series, tags, and full descriptions, even when you're not connected to your host.

### Changed
- **Premium Dashboard Redesign**: A fresh, mobile-first look with smoother transitions and intuitive tab-based navigation.
- **Improved Android Storage**: Better support for selecting and managing your library on Android devices.
- **Robust Sync Engine**: Faster and more reliable book synchronization with enhanced data integrity.

### Fixed
- **Android Book Covers**: Fixed an issue where local covers wouldn't show up on Android devices.
- **App Update Safeguards**: Improved stability by disabling unsupported update checks on mobile platforms.
- **General Stability**: Resolved various startup issues and improved overall application performance.

## [1.0.2] - 2026-03-01

### Fixed
* Fixed a critical bug causing the application to crash on startup in existing installations due to an uninitialized database connection pool configuration.

## [1.0.1] - 2026-03-01

### Added
* Added `framer-motion` layout animations to the synchronization progress queue for smoother UX transitions.

### Changed
* Hardened the host SQLite database connection pool to safely handle heavier concurrent reads from multiple devices.
* Adjusted Nord theme palette base colors to guarantee WCAG AAA contrast accessibility in both light and dark modes.
* Improved GitHub Actions Release pipeline to correctly parse and attach bracket-formatted changelog notes.
* Separated platform badges from tech stack badges in the README for better layout stability.

## [1.0.0] - 2026-03-01

### Added
* **Host/Client Architecture**: Seamlessly sync Calibre libraries across local networks.
* **Calibre Integration**: Directly reads Calibre metadata without modifying original files.
* **Automated Discovery**: mDNS support for automatic connection without IP entry.
* **Format Support**: Built-in background engine for EPUB synchronization.
* **Bulk Download**: Sync multiple books, entire series, authors, or tags at once.
* **Grouped Browsing**: Navigate large libraries by Series, Author, Tag, and Date Added.
* **Secure Pairing**: Protect your library with a 4-digit PIN authentication system.
* **Dynamic Ports**: Automatic port fallback prevents startup failures if defaults are in use.
* **Offline Storage**: Track reading progress and read offline directly on the client.
* **Global Notifications**: Non-intrusive toast notifications track sync progress.
* **Cross-Platform UI**: Responsive, accessible Nord-themed design across desktop and mobile.

### Fixed
* Prevent duplicate downloads when a book sync is already in progress.
* Ensure cleartext local network traffic is allowed on Android clients.
* Fixed various layout constraints and cutoff issues in the Book Details modal.
