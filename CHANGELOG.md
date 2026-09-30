# Changelog

All notable changes to ShelfSync will be documented here from v0.0.1 onward.

## 0.0.1 - 2026-09-29 (pre-release)

Initial pre-release under active development.

- OPDS catalog browsing with authenticated access (HTTP Basic Auth, scoped to the configured server).
- Hash-verified downloads staged as `.part` files with atomic rename and bounded-parallel bulk sync.
- Offline library state tracking (complete, downloading, failed, unavailable, superseded) with explicit reconciliation and no automatic deletion.
- Keystore-backed credential storage on Android and memory-only credentials on desktop.
- Grouped E-Ink-friendly UI with browsing by series, author, tag, or date added.
