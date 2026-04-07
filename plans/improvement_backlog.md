# ShelfSync: Prioritized Improvement Backlog

This backlog lists actionable tasks to improve the project across all evaluated perspectives.

## 🔴 High Priority (Immediate Impact)
1. **Refactor `get_calibre_metadata`**: Split the massive 200+ line function in `src-tauri/src/core/db.rs` into modular SQL queries and processing functions.
2. **Decompose `useClientDashboard`**: Break down the massive hook into smaller, reusable hooks like `useBookFilter`, `useBookSync`, and `useSelection`.
3. **Atomic DB Writes**: Ensure `save_local_book` and `update_local_read_status` in `local_db.rs` use proper transactions or atomic write patterns to prevent corruption.
4. **Improved HTML Cleaning**: Replace manual `.replace()` and character loops in `db.rs` and `search.rs` with a robust HTML parsing/stripping crate.

## 🟡 Medium Priority (Enhanced UX/DX)
5. **Parallel Synchronization**: Update `SyncManager` to allow multiple concurrent downloads (e.g., limit of 3) to improve bulk sync speed.
6. **Detailed Sync Progress**: Update `SyncProgress` to include "X of Y" book counts in the UI.
7. **Accessibility Audit**: Add proper Aria labels and keyboard navigation to `VirtualGrid` and `BookCard`.
8. **Documentation (`CONTRIBUTING.md`)**: Create a guide for developers explaining the backend state management and discovery flow.

## 🟢 Low Priority (Polish & Future-Proofing)
9. **Metadata Pagination**: Implement limit/offset for `get_books` to support massive (>10k) libraries without memory spikes.
10. **Library Sync Versioning**: Add a "library hash" to the Host state that Clients can check to detect if the remote library has changed since the last fetch.
11. **Subtle Transitions**: Implement framer-motion transitions for tab switching and modal interactions to enhance "creative" appeal.
12. **Mobile Folder Picker**: Research and implement a more native-feeling folder picker for Android to replace the current "save hack".
