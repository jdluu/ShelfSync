# Changelog

All notable changes to ShelfSync will be documented here from v0.0.1 onward.

## 0.0.2 - 2026-10-18

Improvements to usability, code architecture, and modernized dependencies.

### Usability (NN/g 10 Heuristics)
- **Visibility of System Status**: Real-time progress bars with percentage indicators for active downloads; updating status feedback when paginating catalogs.
- **Match Between System and Real World**: Contextual error diagnostics with actionable tips for network timeouts, DNS errors, HTTP 401/403 authentication challenges, and missing catalog routes.
- **User Control and Freedom**: Added in-flight download cancellation affordances on both publication cards and detail modals; keyboard Escape and backdrop dismissal for dialogs.
- **Consistency and Standards**: Unified format selection, download action triggers, and badges across catalog views and publication modals.
- **Error Prevention**: Input sanitization and guidance on OPDS catalog URLs and credentials; non-blocking retry mechanisms.
- **Accessibility & Focus Trapping**: Tab and Shift-Tab focus trapping in publication detail modals, full ARIA roles, and screen-reader announcements.

### Architecture (SOLID & DRY)
- **Format Registry**: Extensible `FormatRegistry` supporting Open-Closed Principle (OCP) for acquisition formats and media types.
- **Shared Sanitization Utilities**: Reusable `cleanHtml` and `stripHtml` utilities ensuring secure synopsis rendering.
- **URL Validation & Normalization**: Reusable `isValidOpdsCatalogUrl` and normalization helpers.

### Tech Stack Modernization
- Upgraded dependencies to latest compatible versions across frontend toolchain (Vite 8, Vitest 4, Lucide React, Biome with Tailwind directives).

## 0.0.1 - 2026-09-29 (pre-release)

Initial pre-release under active development.

- OPDS catalog browsing with authenticated access (HTTP Basic Auth, scoped to the configured server).
- Hash-verified downloads staged as `.part` files with atomic rename and bounded-parallel bulk sync.
- Offline library state tracking (complete, downloading, failed, unavailable, superseded) with explicit reconciliation and no automatic deletion.
- Keystore-backed credential storage on Android and memory-only credentials on desktop.
- Grouped E-Ink-friendly UI with browsing by series, author, tag, or date added.
