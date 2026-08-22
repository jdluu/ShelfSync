# Grimmory Client Roadmap

**Status:** Audit complete, implementation not yet started
**Decision:** Substantially refactor ShelfSync
**Primary platform:** Android
**Primary integration:** Grimmory documented OPDS interface
**Non-goal:** EPUB reader functionality

## Guardrails

- Use Grimmory's documented OPDS interface as the catalog and acquisition boundary.
- Keep domain models provider-neutral; isolate OPDS and Grimmory details in the provider adapter.
- Do not use private Grimmory endpoints for the primary catalog flow.
- Do not edit Leafline or add reading/rendering functionality here.
- Never identify books solely by filename, local path, title, or an unscoped integer.
- Never write credentials to source, fixtures, generated files, or committed environment files.
- Do not delete server-removed local files automatically.
- Do not remove the legacy implementation wholesale until replacement tests cover the behavior being retired.
- Keep commits small, conventional, and independently verifiable.

## Milestone 0: Restore validation baseline

**Outcome:** The repository can run its declared frontend and Rust validation commands.

Tasks:

- Restore or document the Node/pnpm and Rust/Cargo toolchain in the development environment.
- Run and record `pnpm vitest run`, `pnpm build`, `pnpm lint`, and `cargo test --manifest-path src-tauri/Cargo.toml`.
- Determine whether `package-lock.json` is intentionally retained. It currently reports a stale root version compared with `package.json`; remove or regenerate it only after confirming policy.
- Run `git diff --check` and inventory ignored/generated files before the first code commit.

Exit criteria:

- All supported checks have real output.
- Failures are categorized as code, dependency, or environment problems.
- No secrets or machine-specific paths are introduced.

## Milestone 1: Provider-neutral domain and OPDS fixtures

**Outcome:** ShelfSync can represent a catalog, navigation item, publication, acquisition, and local identity without Grimmory-specific fields leaking into the UI.

Tasks:

- Define provider-neutral Rust models for catalog feeds, navigation links, publications, authors, series, acquisitions, media types, and pagination.
- Define a provider key and a stable identity structure. Prefer provider-scoped canonical identifiers, retain provisional identities explicitly.
- Add fixture feeds for root navigation, paginated book entries, relative links, multiple formats, missing fields, duplicates, malformed XML, and auth error bodies.
- Add parser tests for Atom namespaces, OPDS link relations, media types, titles, authors, series, identifiers, and next/previous links.
- Ensure XML parsing disables unsafe entity expansion and has bounded input behavior.

Exit criteria:

- Parser tests cover normal, malformed, duplicate, and incomplete feeds.
- No network or real credentials are used by tests.
- Domain models do not depend on the current legacy `Book` fields.

## Milestone 2: Grimmory OPDS transport

**Outcome:** A configured Grimmory OPDS catalog can be fetched safely.

Tasks:

- Add catalog configuration with HTTPS preference and an explicit trusted-LAN exception for HTTP.
- Implement HTTP Basic Auth only for the configured server origin.
- Resolve relative acquisition/navigation links against the catalog URL.
- Reject unsupported schemes and unsafe credential-bearing redirects.
- Categorize unauthorized, forbidden, not found, rate-limited, server, timeout, malformed-feed, and transport failures.
- Fetch root catalog and expose navigation destinations for catalog, recent, libraries, shelves, authors, series, magic shelves, and search where advertised.

Exit criteria:

- Root catalog fetch works against mocked HTTP.
- Wrong credentials produce a typed authentication error without logging the password.
- Malformed XML and missing required links fail safely.
- Link and redirect tests confirm credentials are not sent to another origin.

## Milestone 3: Browse, paginate, and search

**Outcome:** The existing browsing UI can display real OPDS metadata without pretending it is a peer-host manifest.

Tasks:

- Add page/size pagination using the documented Grimmory defaults and maximum.
- Support search through the documented OPDS search/catalog behavior.
- Adapt existing cards, covers, metadata, filters, and virtual grid to provider-neutral publications.
- Represent multiple acquisitions and formats explicitly; do not guess a format from a filename.
- Deduplicate entries by provider-scoped identity while retaining all valid acquisitions.
- Replace legacy discovery and host/client wording in the touched UI.

Exit criteria:

- Mocked root, catalog page, next page, and search flows render correctly.
- Duplicate entries do not create duplicate domain records.
- Missing cover, author, series, description, and acquisition links are handled gracefully.

## Milestone 4: Local download-centric persistence

**Outcome:** The local database tracks remote publications and download revisions without Calibre coupling.

Tasks:

- Introduce schema tables for provider/catalog account, publication, acquisition, file revision, and download job.
- Store provider-scoped identity, canonical URL, selected media type, metadata snapshot, expected length/hash, local relative path, state, and timestamps.
- Add an explicit migration strategy from the existing local database. Preserve old rows as legacy/unavailable where safe; do not reinterpret integer ids silently.
- Keep content root separate from database metadata.
- Add duplicate, migration, restart, and stale-job tests.

Exit criteria:

- A publication can appear in multiple feeds without duplicate local identities.
- Format-specific downloads have format-specific records.
- Existing verified files remain usable after metadata refresh or server removal.

## Milestone 5: Verified single EPUB download

**Outcome:** One OPDS-advertised EPUB can be downloaded, verified, atomically installed, and persisted.

Tasks:

- Select an advertised EPUB acquisition link.
- Download to a unique `.part` file beneath the configured content root.
- Emit durable progress and support cancellation.
- Retry only retryable failures.
- Verify response status, expected length/hash when available, and EPUB ZIP structure.
- Close and atomically rename only after verification.
- Mark the database complete only after the final rename succeeds.
- Keep an old revision until the replacement is complete.
- Add safe filename generation, canonical root containment, and explicit safe-delete helpers.

Exit criteria:

- Success path persists metadata and a verified EPUB.
- Auth failure, malformed response, interruption, disk failure, length/hash mismatch, and invalid ZIP leave no falsely complete record.
- Replacement failure leaves the old verified file intact.
- Delete tests prove paths outside the content root cannot be removed.

## Milestone 6: Offline library and reconciliation UX

**Outcome:** Users can manage downloaded content without confusing server state with local state.

Tasks:

- Add offline library views for complete, downloading, failed, unavailable, and superseded records.
- Refresh metadata and detect newly added/changed books without automatic destructive actions.
- Mark server removals as unavailable and offer explicit user-controlled local deletion.
- Add disk-space checks and stale partial cleanup.
- Ensure app restart restores jobs and records correctly.

Exit criteria:

- Server removal never silently removes local content.
- A changed file creates a new revision safely.
- Offline content remains visible when the server is unavailable.

## Milestone 7: Android hardening

**Outcome:** Downloads and credentials behave correctly on Android.

Tasks:

- Evaluate native secure storage/Android Keystore integration for OPDS credentials.
- Persist Storage Access Framework selection safely, or default to app-private storage.
- Replace legacy host/multicast/BLE permissions and services with only required download permissions.
- Use WorkManager or a user-visible foreground service for long-running downloads only.
- Test process death, backgrounding, rotation, metered network, low storage, and cancellation.
- Build an unsigned debug APK and perform a safe install/smoke test when the toolchain is available.

Exit criteria:

- Passwords never enter WebView logs or diagnostics.
- A background download resumes or fails visibly and safely after process interruption.
- Permission requests match actual features.

## Milestone 8: Optional KOReader progress adapter

**Outcome:** A separately tested, opt-in progress integration exists only if the documented protocol remains stable.

Tasks:

- Verify current Grimmory KOReader configuration and endpoint contract from live docs and compatible client behavior.
- Use content hashes and byte-identical OPDS downloads as the identity boundary.
- Keep KOReader credentials separate from OPDS credentials.
- Implement push/pull only behind an adapter with explicit conflict and failure semantics.
- Never map progress by title, filename, or Grimmory id alone.

Exit criteria:

- Protocol fixtures and identity tests exist.
- Progress failure cannot corrupt local download state.
- The feature can remain disabled without affecting browsing/downloads.

## Milestone 9: Retire legacy peer architecture

**Outcome:** The product no longer presents a misleading host/client or peer-sync model.

Tasks:

- Remove or quarantine local Axum peer API, PIN pairing, mDNS/BLE discovery, host dashboard, Calibre mutation, and obsolete peer progress endpoints.
- Remove legacy E2E tests after equivalent OPDS/download coverage exists.
- Reduce Android generated services and permissions.
- Update README, wiki, metadata, and release documentation to describe the Grimmory client accurately.

Exit criteria:

- No supported user flow requires a ShelfSync host.
- No code path writes to a Calibre database.
- Documentation matches tested behavior.

## Immediate next task

Implement **Milestone 1 only**: the provider-neutral OPDS models, parser, and mocked fixtures/tests. Before coding, restore the validation toolchain and record the baseline. Do not start with a large UI rewrite, progress sync, or legacy deletion.

## References

- Grimmory OPDS: https://grimmory.org/docs/integration/opds
- Grimmory KOReader Sync: https://grimmory.org/docs/integration/koreader
- Grimmory generated API: https://grimmory.org/api
- Grimmory repository: https://github.com/grimmory-tools/grimmory
- ShelfSync audit: `docs/analysis/grimmory-client-audit.md`

## Current blockers

- The audit shell did not expose runnable Node/pnpm or Rust/Cargo executables, so baseline validation could not be executed.
- No real Grimmory credentials or private catalog URL were used or required for the audit.
- No implementation has been started until the baseline toolchain is restored.
