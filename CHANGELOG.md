# Changelog

All notable changes to this project will be documented in this file.

## [1.4.0] - 2026-08-23
### Added
- **Live Sync Queue**: Download progress events now reach the UI in real time; the queue overlay shows per-book status with download-first ordering and auto-dismisses when the queue settles (#8).
- **X of Y Batch Progress**: Bulk syncs surface a "X of Y books" summary with failed counts in both the queue overlay and the client toolbar (#9).
- **Intentional Mobile Storage Picker**: On Android, choosing a download location now presents a clear two-option choice (recommended location or browse) instead of a silent save-file hack (#13).
- **Paginated Metadata Query**: New `get_books_page` command with limit/offset for large Calibre libraries, alongside the existing full-load path (#11).
- **Accessibility Improvements**: Book grid uses proper list semantics and book cards are keyboard-reachable with full accessible names (#10).
- **HTML Cleaning Module**: Description cleaning extracted into a dedicated, well-tested module (11 unit tests) (#4).

### Changed
- **Atomic Local DB Initialization**: Schema creation and migrations now run inside a single transaction (#6).
- **Hardened HTML Entity Handling**: Nested tags and malformed entities are stripped safely (#7).
- **Repository Presentation**: Rewrote user-facing README with a real screenshot, updated repo description and topics to reflect the OPDS client focus.

### Fixed
- **Superseded Revision Safety**: Added integration coverage proving server-side catalog removal never deletes local files — superseded revisions survive on disk (#3).
- Pre-existing lint error in offline library grouping.

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
