# Changelog

All notable changes to this project will be documented in this file.

## [1.6.0] - 2026-08-24
### Added
- **Brand v2 redesign**: complete visual overhaul for the OPDS-client pivot. New "paper" (light) and "lamplight" (dark) themes with warm paper neutrals and a single lamplight-amber accent; Source Serif 4 for book titles and the wordmark; cover-forward publication cards; calmer connect screen.
- **New logo and app icons**: open-book-and-lamp mark across desktop (ico/icns/Store logos) and Android, including a proper adaptive-icon foreground (safe-zone compliant, transparent) and a monochrome layer for Android 13+ themed icons.
- **README screenshots**: connect screen and catalog grid captured in both themes.

### Changed
- Old `light`/`dark` theme preferences map to the new theme names automatically.

## [1.5.0] - 2026-08-24
### Changed
- **Pure OPDS Client**: Removed all vestigial peer-to-peer features (discovery, host dashboard, role selection, pairing auth, BLE/mDNS/tray, Axum HTTP server). ShelfSync is now a focused OPDS catalog client (-5,356 lines) (#27).
- **OPDS-First Navigation**: App loads directly into the OPDS catalog browser. Removed `appMode`/role selection system, `appStore.ts`. Settings accessible via gear icon sidebar (#28).
- **Refactored commands/opds.rs**: 735-line monolith split into `transport`, `catalog`, `download` sub-modules — no behavior change (#29).
- **Refactored persist/repo.rs**: SQL queries and grouping logic extracted into `queries.rs` and `grouping.rs` (#30).
- **Refactored OpdsPublicationCard**: 423-line component split into `usePublicationState` hook (170L) and `PublicationFormatMenu` component (105L) (#31).
- **Refactored libraryStore**: Split into focused `libraryStore` (book CRUD) and `storageStore` (path management) (#32).
- **Infisical Optional**: Local Android builds degrade gracefully to debug signing when Infisical CLI is absent; CI already uses GitHub Secrets only.

### Added
- **Obtainium Install Badge**: One-tap "Add to Obtainium" button in README for Android installs and auto-updates.
- **A11y Audit**: OPDS catalog form labels, focus management, publication card aria-labels with progress, format menu keyboard navigation — 17 new a11y tests (#35).
- **Test Coverage**: Vitest tests for ClientDashboard rendering states and store actions (#33).
- **E2E CI Job**: Optional Playwright job in CI (requires display server, continue-on-error) (#36).

### Fixed
- TypeScript strict errors in QueueOverlay, A11y tests, offlineLibrary tests (14 fixes).

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
