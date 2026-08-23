# Leafline and ShelfSync: Division of Responsibility

Leafline and ShelfSync are two separate apps with strictly separated concerns.
This document is the source of truth for what belongs where. When adding a
feature, check this table first.

## Summary

| | Leafline | ShelfSync |
|---|---|---|
| Purpose | EPUB reading app | Grimmory/Calibre-compatible sync client |
| Platform | Native Android (Kotlin, Jetpack Compose) | Tauri desktop + Android shell (React frontend, Rust backend) |
| Rendering | Readium Kotlin Toolkit (EPUB rendering) | None. Never renders or opens books for reading |
| Catalog | OPDS browse + download into local library (client role only) | OPDS browse, authenticated download, offline reconciliation (primary domain) |
| Local data | Room DB: library metadata, reading position, bookmarks, highlights | SQLite (rusqlite): provider-scoped publications, acquisitions, file revisions, download jobs |
| Sync/progress | Reads locally; future KOReader-compatible progress push | Future: library reconciliation against the Grimmory server |
| Calibre | Out of scope entirely | Legacy compatibility layer exists; new work uses OPDS instead |

## Leafline owns

- Reading experience: paginated/scrolled EPUB rendering, themes, fonts, tap zones
- Reader features: bookmarks, highlights/annotations, in-book search
- Local reading state: last-read locator, per-book preferences
- Its own small library of imported/downloaded EPUBs on device

## Leafline must never do

- Host a server, act as a Calibre replacement, or mutate a Calibre `metadata.db`
- Implement OPDS server logic (it is an OPDS *client* only)
- Duplicate ShelfSync's download-job/persistence model beyond what reading needs

## ShelfSync owns

- Grimmory/OPDS catalog connection, authentication, browsing, pagination, search
- Safe, verified downloads (`.part` files, hash checks, atomic rename)
- Download-centric persistence: provider-scoped identity, revisions, job states
- Offline library states: complete / downloading / failed / unavailable / superseded
- Reconciliation with the remote catalog without destructive automatic actions

## ShelfSync must never do

- Render EPUBs or provide any reading UI (hand off to Leafline or the system)
- Identify books by filename, title, path, or unscoped integer id alone
- Delete user content automatically (deletion is always explicit)

## Handoff boundary

ShelfSync downloads and verifies a file on disk. Leafline (or any reader app)
opens that file for reading. The only shared artifact between the apps is the
EPUB file itself plus, eventually, standard KOReader-style progress records.
There is no shared database, no shared process, no embedded web view coupling.
