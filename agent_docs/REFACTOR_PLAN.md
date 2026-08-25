# ShelfSync Comprehensive Refactor Plan (post-feature-freeze)

Status: ACTIVE. Owner: jdluu. Executor: OpenCode (`opencode-bws`, model
`openrouter/stealth/ox-alpha`) under Hermes pilot supervision.

## Ground rules (every milestone, no exceptions)

1. One branch per milestone off `main`: `refactor/mN-<slug>`.
2. Behavior-preserving. No feature changes, no UI changes, no API/IPC changes.
3. Validation gate before any commit:
   - `cargo test --manifest-path src-tauri/Cargo.toml`  (200 tests must pass)
   - `pnpm vitest run`                                  (170 tests must pass)
   - `npx tsc -b`                                       (0 errors)
   - `biome check .`                                    (clean)
   - `cargo check`                                      (0 warnings)
4. Android device verification (Pixel 7 via adb) at the end of each phase:
   `pnpm tauri android build --apk` + install + manual/scripted smoke test.
   Nothing is assumed working until verified on-device.
5. Commits: conventional, granular, per logical step. PR per milestone.

## Milestones

### M1 — Rust backend layering (SOLID: SRP + DIP)

The OPDS domain is the core asset. Split by responsibility:

- `src-tauri/src/opds/install.rs` (1201 lines) -> extract:
  - `install/path_planner.rs` (destination resolution, filename derivation)
  - `install/archive_validator.rs` (zip/epub structural validation)
  - `install/file_installer.rs` (atomic rename, revision replacement)
  - keep `install.rs` as a thin facade re-exporting the public API so all
    call sites stay valid (open/closed).
- `src-tauri/src/opds/downloader.rs` (829) -> extract HTTP streaming and
  hash-verification into `downloader/verify.rs`; progress-event emission into
  `downloader/progress.rs`.
- Introduce a `ContentVerifier` trait in `opds/mod.rs` (hash strategy behind
  an interface; sha256/md5 implementations injected). Downloader depends on
  the trait, not concrete types (DIP).

Acceptance: line counts of new modules < 400 each; public API unchanged;
all 200 cargo tests green without modification (tests may move with code).

### M2 — Rust persistence + commands (SRP, repository pattern)

- `src-tauri/src/persist/store.rs` + `queries.rs`: formalize a
  `LibraryRepository` trait; SQLite impl stays, callers depend on trait.
- Deduplicate SQL row-mapping helpers repeated across queries.rs (DRY):
  one `RowMapper` module.
- Error handling: replace remaining string-y errors in opds command layer
  with typed variants of existing error enums (no behavior change).

### M3 — Frontend state & services (DRY, single source of truth)

- `OpdsCatalogScreenContainer.tsx` (258 lines, 12+ useState): extract
  download-state machine into `useDownloadRegistry` hook; catalog connection
  state into `useCatalogConnection`. Container becomes composition only.
- `PublicationDetailModal` + `OpdsPublicationCard`: shared format-menu logic
  already extracted; deduplicate acquisition-link selection logic into
  `types/opds.ts` helper (single source for "which link do I download").
- Services: unify error-toast patterns across opdsClient/offlineLibrary via
  one `notifyOpdsError` util.

### M4 — Comprehensive test suites + CI

Rust:
- Unit tests colocated for every new module from M1/M2 (trait mocks for
  ContentVerifier / LibraryRepository).
- Integration test: end-to-end download pipeline against a local fixture
  server (wiremock), covering .part -> verify -> atomic rename -> revision.

Frontend:
- Vitest for every new hook (useDownloadRegistry, useCatalogConnection):
  happy path, error path, race/cancel path.
- Component tests for PublicationDetailModal format menu incl. a11y.

CI (.github/workflows/ci.yml):
- Add `cargo clippy -- -D warnings` job step (deny new warnings).
- Add `cargo fmt --check` step.
- Keep e2e compile gate; add job comment documenting adb-based smoke plan.

Coverage expectation: every public function of every new module has at least
one test; every bug fixed during refactor gets a regression test.

### M5 — Android on-device verification (gate for "done")

Prereq: Infisical secrets fetched (`pnpm secrets:fetch`), NDK present.
- Build release APK, install to Pixel 7 (adb 28261FDH200F50).
- Scripted adb smoke: launch app, connect to local Grimmory catalog,
  browse, download one publication, confirm file exists in app storage,
  force-stop and relaunch (offline library restore path works).
- Screenshot/log evidence recorded in PR description.
- Any failure = reopen the responsible milestone; device verification is
  the definition of "not broken".

## Execution protocol per milestone

1. Pilot writes bounded prompt; OpenCode implements on the milestone branch
   in its own worktree (parallel-safe across milestones where files are
   disjoint: M1+M2 backend vs M3 frontend can run concurrently).
2. Pilot independently runs the full validation gate.
3. PR opened; CI must pass; pilot reviews diff for scope creep.
4. Squash-merge after review; board item updated.
