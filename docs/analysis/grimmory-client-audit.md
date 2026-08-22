# ShelfSync Grimmory Client Audit

**Date:** 2026-08-22
**Repository:** `jdluu/ShelfSync`
**Audited revision:** `26ec543` on `main`
**Scope:** Audit and first-slice recommendation only. Leafline was not inspected or modified.

## Executive summary

ShelfSync is salvageable as a Grimmory library synchronization and download client, but not as a continuation of its current host/client product model. The existing Tauri, React, Rust, HTTP, SQLite, download, and Android foundations are reusable. The current domain model and user flow are centered on a self-hosted Calibre peer server, which is the wrong source-of-truth for the new goal. The right decision is **substantially refactor ShelfSync**, preserving the shell and proven infrastructure while isolating or retiring peer-host, Calibre-writing, mDNS/BLE, and fabricated progress behavior.

The first implementation should be a narrow Grimmory OPDS vertical slice: configure a catalog URL, use OPDS HTTP Basic Auth, fetch and parse the root catalog, browse paginated acquisitions, download one supported format through an acquisition link, verify the file, and persist download metadata. No reader, server replacement, Calibre database editor, or progress synchronization should be added in this phase.

## Repository and history baseline

- Working tree was clean at audit start.
- Branch: `main`, tracking `origin/main`.
- Remote: `https://github.com/jdluu/ShelfSync`.
- HEAD and `origin/main`: `26ec543` (`chore: finalize server tests and apply remaining component fixes`).
- Latest tag: `v1.3.2` at `fab0f5c`.
- 238 tracked files were present at audit time.
- Recent history shows incremental construction of the current architecture: core synchronization/discovery (`a48dd58`), reliability/discovery changes (`8dd0556`), progress UI (`438d386`), Calibre compatibility (`cf8e216`), and backend/database modularization (`5f882c5`).

The history indicates the architecture was chosen to make one ShelfSync desktop instance host a Calibre library and other instances discover and download from it over a local network. That explains the current abstractions, but also shows why they should not be treated as requirements for a Grimmory client.

## Current architecture

```text
React + TypeScript + Vite UI
        │ Tauri invoke/events
Rust/Tauri application layer
        ├── Calibre metadata.db reader
        ├── local Axum HTTP server
        ├── mDNS and BLE discovery
        ├── download/sync queue
        ├── local SQLite progress/book state
        ├── Tantivy content search
        └── Android generated Tauri project
```

### Frontend

The frontend has feature areas for role selection, host dashboard, client dashboard, discovery, library cards/grids, grouping/filtering, selection, sync queue display, settings, notifications, and responsive presentation. TanStack Query handles query state, Zustand handles application/auth/library/sync/discovery state, and Zod validates some Tauri responses.

`src/services/apiClient.ts` is specifically a ShelfSync peer-host client. It invokes local Tauri commands for Calibre access and calls `/api/status`, `/api/manifest`, `/api/check-pin`, `/api/progress`, and `/api/download/...` on a ShelfSync host. It has no OPDS XML client.

### Tauri and Rust backend

`src-tauri/src/lib.rs` initializes the Tauri plugins and a large shared state object, restores settings, initializes Tantivy and a progress database, starts a local Axum server, starts mDNS advertising, and creates a `SyncManager`. Commands cover Calibre library loading, local database operations, network discovery, hosting mode, and synchronization.

### Calibre access

`core/db.rs` reads Calibre `metadata.db`, joins books/authors/series/tags/formats, and returns a `Book` model. `core/calibre.rs` additionally creates or mutates a Calibre-compatible database and is therefore not merely a read-only compatibility layer.

### HTTP API

`http/server.rs` exposes the local peer API. Authentication is a generated/persisted PIN exchanged for an in-memory bearer token. Books are served from a configured local library path. `http/books.rs` serves JSON manifests and streams files. `http/progress.rs` serves the local ShelfSync progress model. This API is private to the legacy peer architecture and is not Grimmory's API.

### Discovery

mDNS (`core/mdns.rs`) and BLE (`core/ble.rs`) discover or advertise ShelfSync peers. They have no role in finding a configured Grimmory server and should not be carried into the first client slice.

### Download/sync

`core/sync.rs` queues up to three tasks, retries requests, creates author/title directories, writes a cover and generated `metadata.opf`, downloads a file, and emits progress events. It currently targets `/api/download/{id}/best`, uses bearer authentication, guesses extensions from a peer-side path, and writes directly to its final destination.

### Local database and progress

`commands/local_db.rs` stores a local book row keyed by a local SQLite id and unique `remote_id`, with paths, format, metadata, and a simple unread/reading/finished field. It also attempts to infer a library root from the destination path, writes into a Calibre database, and indexes downloaded EPUB content. `core/progress.rs` is a local status table, while the peer HTTP progress endpoints expose it as if it were a synchronized remote protocol.

### Android

Android is a generated Tauri project with Internet, network, storage, notification, wake-lock, multicast, Bluetooth, and location-related permissions. It includes a foreground service and WorkManager worker for the legacy host/sync model. Android should remain a target, but permissions and background services should be reduced to what offline downloads actually require. No reader functionality is present in the target direction.

## Current build and test status

The repository declares these relevant commands:

- Frontend tests: `pnpm vitest run`
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Type check/build: `pnpm build`
- Lint: `pnpm lint`
- E2E: `pnpm test:e2e`
- Desktop build: `pnpm tauri build`
- Android build: `pnpm build:android`

The audit environment did not have the required executables available to the shell: Node/pnpm and Rust/Cargo were not usable in the validation shell. Consequently, the frontend tests, build, lint, and Rust tests could not be executed. This is an environment/toolchain blocker, not a passing result. Existing E2E tests additionally require a running Tauri app and CDP endpoint, so they were not run.

The repository has two package manifests with drift: `package.json` reports version `1.3.2`, while the tracked `package-lock.json` root reports `1.2.0`. `pnpm-lock.yaml` is the declared lockfile and should be authoritative; the stale npm lockfile should be removed or regenerated in a separate dependency-maintenance change after confirming project policy.

## Reusable components

1. **Tauri shell and plugin integration:** useful for Android-first native file access, app data, notifications, and lifecycle integration.
2. **React presentation system:** cards, covers, metadata display, virtual grid, responsive layout, settings, empty/error/loading states, and accessibility work can be adapted to remote catalog data.
3. **TanStack Query and Zustand boundaries:** useful for catalog queries, configuration, download queue state, and local library state.
4. **Rust HTTP streaming foundation:** reqwest streaming and Tauri event emission are appropriate foundations for resumable, verified downloads once rewritten around acquisition links.
5. **SQLite local persistence:** useful, but the schema must become provider/catalog/download-centric rather than Calibre/peer-centric.
6. **Error type and IPC validation:** `AppError`, command registration, and Zod validation patterns are reusable.
7. **Android packaging and background execution:** potentially reusable after removing permissions and services that only support local hosting or discovery.
8. **Mocking and fixture approach:** existing frontend mocks and Playwright structure provide a starting point, but OPDS XML fixtures and Rust HTTP fixtures are needed.

## Components to remove or isolate

### Isolate initially

- `core/sync.rs`: retain the idea of a queue and progress events, but replace URL construction, path inference, metadata sidecar creation, and direct-final-file writes.
- `commands/local_db.rs`: retain SQLite access but replace the schema and remove Calibre writes and path-derived root inference.
- `src/services/apiClient.ts`: preserve a transport abstraction, but add an OPDS provider implementation rather than extending peer endpoints.
- Book UI components: retain presentation, but change the model to provider-neutral domain objects with explicit acquisition formats.

### Retire from the main product path

- Host mode and Calibre library selection.
- Local Axum peer server, PIN pairing, bearer tokens, and peer manifest/progress endpoints.
- mDNS/BLE discovery and the host foreground service.
- `core/calibre.rs` database creation/mutation. ShelfSync must not become a Calibre database editor.
- Tantivy EPUB-content indexing until local-library requirements justify it.
- Generated `metadata.opf` and automatic `cover.jpg` conventions as synchronization mechanisms.
- Any E2E test asserting a two-instance ShelfSync host/client product flow.

Do not delete these in bulk before replacement behavior has tests. Deprecate or quarantine them milestone by milestone.

## Current sync limitations and risks

1. **Wrong source-of-truth:** the client assumes a peer ShelfSync host and Calibre ids, not Grimmory's catalog.
2. **Non-portable identity:** `remote_id` is an integer and is meaningful only inside the old host. It cannot safely identify a Grimmory publication across catalogs or revisions.
3. **Unsafe download writes:** files are created/truncated at their final path. Interrupted downloads can appear complete, and retries restart without a durable state machine.
4. **Unsafe deletion:** local deletion uses a stored path with insufficient proof that it is beneath the configured storage root. A future design must enforce canonical root containment.
5. **Format confusion:** the downloader guesses an extension from a peer path and always persists `epub` in the local database, even when the actual selected format differs.
6. **Metadata side effects:** a client download can mutate/create a Calibre database based on parent-directory guesses. This conflicts with the new non-goal.
7. **Incorrect progress semantics:** local status values are not KOReader-compatible progress and should not be sent to Grimmory.
8. **Concurrency bookkeeping:** queue positions are reported as zero and active queue identity is based on integer book ids, which is insufficient for multiple providers/revisions.
9. **Duplicated documentation:** README, wiki, changelog, and implementation describe a feature-rich peer product, including behavior that should not be assumed to work until tests run.
10. **Testing gap:** only two frontend unit-test files are tracked; there are no OPDS parser, authentication, download-integrity, path-safety, or local migration tests.

## Grimmory integration requirements verified from live sources

Authoritative sources consulted on 2026-08-22:

- OPDS documentation: https://grimmory.org/docs/integration/opds
- KOReader documentation: https://grimmory.org/docs/integration/koreader
- Generated API documentation: https://grimmory.org/api
- Repository: https://github.com/grimmory-tools/grimmory

The live OPDS documentation states:

- Enable the OPDS server in Grimmory Settings > OPDS.
- Standard catalog URL pattern: `/api/v1/opds`.
- OPDS accounts are separate from normal Grimmory accounts and use HTTP Basic Auth.
- OPDS users inherit library access from the linked Grimmory user.
- Root navigation includes catalog, recent, libraries, shelves, magic shelves, authors, series, and surprise feeds.
- Search uses `/api/v1/opds/catalog?q={terms}`.
- Acquisition feeds support `page` and `size`, default size 50 and maximum size 100.
- Books expose series metadata when available and acquisition links point to downloadable formats.
- The documentation describes EPUB and other library formats through the OPDS acquisition model. The client must honor advertised media types and links rather than infer support from filenames.
- HTTP Basic Auth credentials must not be logged or placed in fixtures.

The generated API documentation currently lists the OPDS routes, including root catalog, catalog, recent, libraries, shelves, series, authors, search description, and `/api/v1/opds/{bookId}/download`. The generated REST API is explicitly marked unstable. It is useful for investigation and future optional features, but it must not replace the documented OPDS interface for the primary catalog client.

The current Grimmory repository was live and active at audit time, with a recent `develop` commit and a v3.3.3 release. Grimmory's own API documentation warns that the generated REST API is unstable.

## Progress synchronization options

Progress is explicitly deferred. The live KOReader documentation says:

- Grimmory exposes a KOReader-compatible sync endpoint configured in Settings > Devices.
- KOReader credentials are separate from Grimmory login and OPDS credentials.
- Books are matched by file content hash, not title, filename, or Grimmory numeric id.
- The downloaded file must be byte-identical for progress to match.
- KOReader's binary document matching mode is required for this identity behavior.

Possible future approaches, in descending safety:

1. **Documented KOReader protocol adapter:** implement only after capturing the exact request/response contract from current Grimmory docs and compatible client behavior, with byte-identical downloaded files and explicit user configuration.
2. **External handoff to KOReader:** let the user open the locally downloaded file in KOReader and configure sync there. This avoids pretending ShelfSync implements the protocol.
3. **Grimmory app REST progress endpoints:** investigate only if documented for client use and if the identity model is stable. Do not use private endpoints merely because they exist in generated OpenAPI.

A title/id-based progress sync would be unsafe and is prohibited by this audit.

## Proposed target architecture

```text
Provider-neutral domain
  Catalog, Navigation, Publication, Acquisition, DownloadRecord
        │
Provider interface
  OpdsProvider (Grimmory documented OPDS)
        │
Transport
  HTTP Basic Auth, redirects, timeouts, XML parsing, typed errors
        │
Application services
  Browse, search, paginate, download, verify, reconcile
        │
Local repository
  SQLite metadata + app-private/content storage + atomic files
        │
Tauri commands/events
        │
React Android-first UI
```

Suggested boundaries:

- `domain`: provider-neutral models and identity rules.
- `providers/opds`: feed parser, link resolution, pagination, auth transport, media-type selection.
- `downloads`: durable job state, temp files, resume policy, byte/length/hash verification, atomic rename.
- `library`: local records and reconciliation states.
- `storage`: root selection, canonical path containment, safe delete, free-space checks.
- `progress`: future optional adapter, disabled until protocol and identity verification.
- `ui`: browse/search/details/downloads/offline library. No rendering engine.

Keep a provider interface because it is inexpensive at this boundary and protects the domain from Grimmory-specific XML/link details. Do not build a generic multi-provider framework beyond the interface needed by OPDS.

## Android-specific concerns

- Prefer app-private storage by default, with an explicit Storage Access Framework directory choice only when users need exported files.
- Persist the selected tree URI or equivalent platform-safe handle, not an arbitrary path string.
- Use WorkManager or a platform-appropriate foreground download service only for user-visible long-running downloads. Do not retain host-mode services.
- Request Internet first; avoid Bluetooth, multicast, location, broad storage, and wake-lock permissions unless a tested feature requires them.
- Ensure cancellation survives process death and that downloads are discoverable in the local library after restart.
- Handle metered networks, battery restrictions, low space, scoped storage, and rotation/background transitions.
- Never expose OPDS passwords to the WebView or log them. Use platform secure storage or a narrowly scoped native credential store. Tauri Store is not automatically equivalent to Android Keystore protection.

## Offline storage design

Use an application-managed content root with a separate SQLite database. Store each publication revision as a durable record with:

- provider key and canonical acquisition/source URL;
- provider publication identifier when available;
- stable identity key derived from provider identity plus normalized publication identity;
- selected format and media type;
- expected length and hash when advertised or computed;
- local relative filename, never an arbitrary absolute path from the server;
- download state, bytes received, timestamps, and last error;
- metadata snapshot and server revision markers;
- deletion/replacement status.

Write to a uniquely named `.part` file, fsync/close where supported, validate type and size/hash, then atomically rename into a generated safe filename. The database transition to `complete` must occur after the rename. Cleanup stale `.part` files on startup. Keep metadata separate from content so a record can survive a removed server book without silently deleting the local file.

## Book identity and deduplication

Priority order:

1. Provider-scoped stable publication identifier from the OPDS entry or canonical Grimmory acquisition identity.
2. Provider-scoped canonical self/alternate identifier from the feed.
3. For a last-resort provisional key only, normalized title plus ordered authors plus selected media type, marked uncertain and eligible for later merge.
4. Content hash identifies a downloaded file revision and is the required future KOReader matching key, but it should not be the sole catalog identity because it is unavailable before download and changes when bytes change.

Never use filename, local path, title alone, or a raw integer id as the sole identity. Deduplicate multiple feed appearances by canonical identifier while retaining multiple acquisitions/formats and revision hashes.

## Download, update, and delete safety rules

- Accept only HTTP(S) acquisition URLs resolved against the configured catalog origin; reject unexpected schemes and cross-origin redirects unless explicitly allowed by policy.
- Send Basic Auth only to the configured server origin, not arbitrary redirected hosts.
- Select media types from an allowlist and show the selected format to the user.
- Enforce maximum path component lengths and replace unsafe characters. Never use server-provided paths directly.
- Download to a temp file, support cancellation, retry only retryable failures, and retain resumable state only when range semantics are verified.
- Verify HTTP status, content type where reliable, expected length, ZIP/EPUB structure for EPUB, and content hash when available.
- On replacement, keep the old verified revision until the new one completes. Mark the old revision superseded only after the new file is complete.
- On server removal, mark the local record unavailable and leave the file by default. Deletion requires an explicit user action or a separately enabled reconciliation policy.
- Delete only files whose canonical path is beneath the configured content root and whose database record matches the path. Never recursively delete a user-selected root.
- A malformed feed, auth failure, partial response, hash mismatch, or disk error must leave the previous verified file usable.

## Security and credential storage

- OPDS uses Basic Auth, so HTTPS is strongly preferred. Warn on cleartext HTTP except for an explicit trusted LAN configuration.
- Do not include credentials in URLs, logs, crash messages, fixtures, screenshots, or committed configuration.
- Store secrets in native secure storage where available. If the current Tauri store is used temporarily, document its protection limits and avoid treating it as a password vault.
- Clear credentials on disconnect/remove-account and provide a testable logout path.
- Redact Authorization headers and URLs containing userinfo from diagnostics.
- Validate certificate behavior using platform defaults. Do not add “accept invalid certificates” options.
- Treat feed XML, titles, descriptions, filenames, and links as untrusted input. Bound parser sizes, prevent XML entity expansion, and sanitize UI rendering.

## Risks and unknowns

- OPDS XML variants and namespaces may differ between Grimmory versions and other OPDS servers; fixtures must cover realistic Atom/OPDS 1.x structures.
- Some feeds may expose relative, templated, or multiple acquisition links. Link selection and pagination need fixtures and explicit rules.
- Advertised hashes/content lengths may be absent or inconsistent; verification must degrade safely.
- Grimmory's generated REST API is unstable and should not silently become a dependency.
- KOReader sync is hash-based and separate from OPDS credentials; implementing it prematurely would create false confidence.
- Android Tauri plugin support for secure credential storage and persistent downloads needs a focused spike.
- Existing generated Android files and CI secrets flow are machine/toolchain-sensitive and should not be expanded without a working local build.
- The current environment lacks runnable Node/pnpm and Rust/Cargo commands in the audit shell, blocking validation until the toolchain is restored.

## Recommendation

**Substantially refactor ShelfSync.** Reuse the Tauri shell, frontend component system, Rust streaming/database foundations, and Android packaging. Replace the product center with Grimmory OPDS browsing and offline downloads. Do not preserve host/client behavior merely because it exists. Do not archive/rewrite yet because the reusable foundation is substantial and the first OPDS slice can test the product direction cheaply.

## Explicit non-goals

- EPUB or PDF rendering, pagination, annotations, or reading UI.
- Grimmory server replacement or server administration.
- Calibre database editing or automatic mutation of a Calibre library.
- General peer-to-peer synchronization.
- mDNS/BLE discovery of ShelfSync peers.
- Filename/path-only identity.
- Full progress synchronization before protocol and identity tests exist.
- Broad provider support beyond a small provider abstraction around documented OPDS.
- Unreviewed deletion of local content when a server book disappears.

## Phased implementation plan

1. **Foundation and fixtures:** add provider-neutral types, OPDS XML fixtures, parser tests, typed error categories, and a catalog configuration model. No UI rewrite.
2. **OPDS transport:** implement configured origin, Basic Auth, safe URL resolution, root catalog fetch, feed parsing, and auth/malformed-feed tests.
3. **Browse and search:** add paginated catalog/navigation queries and adapt the existing client UI to real publication metadata. Test page links, duplicate entries, missing links, and search.
4. **Durable local library:** migrate/introduce a download-centric SQLite schema with provider-scoped identities and explicit states. Add migration and deduplication tests.
5. **Verified download slice:** implement one EPUB download with `.part` files, cancellation/interruption handling, ZIP verification, atomic rename, and persistence. Add path safety, retries, hash/length, and replacement tests.
6. **Offline library UX:** show complete, partial, unavailable, superseded, and failed records; make deletion explicit and safe. Add restart/reconciliation tests.
7. **Android hardening:** secure credential storage, Storage Access Framework behavior, WorkManager/foreground download policy, low-space and background tests, then an APK smoke test.
8. **Optional progress research:** validate KOReader protocol and content-hash identity against documented current behavior. Implement only behind a separate tested adapter if the result is stable.
9. **Legacy retirement:** after replacement coverage exists, remove host mode, peer HTTP, discovery, Calibre mutation, and obsolete E2E tests in small reviewable commits.

The next smallest implementation task is **a pure OPDS Atom/OPDS parser plus mocked HTTP transport tests**, not a UI rewrite or progress sync.

## Audit conclusion

ShelfSync has a useful shell but an obsolete center of gravity. The audit supports continuing the repository as a Grimmory synchronization/download client through substantial refactoring. The first proof must be a tested OPDS client and verified single-file download. Until the missing toolchain is restored and those tests execute, no claim should be made that the existing application build or legacy sync flow currently works.

## Verification sources

- Grimmory OPDS: https://grimmory.org/docs/integration/opds
- Grimmory KOReader Sync: https://grimmory.org/docs/integration/koreader
- Grimmory generated API: https://grimmory.org/api
- Grimmory source repository: https://github.com/grimmory-tools/grimmory
- ShelfSync repository: https://github.com/jdluu/ShelfSync

*This report intentionally does not contain credentials, private server URLs, or machine-specific server identifiers.*
