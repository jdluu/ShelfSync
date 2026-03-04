# Changelog

All notable changes to this project will be documented in this file.

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
