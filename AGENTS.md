# AGENTS.md

Runtime instructions for ShelfSync, a Tauri 2 (Rust + React/TS) Grimmory/OPDS client that downloads verified
publications into an offline library. Not a reader. User docs: `README.md`. Design system: `DESIGN.md`.

## Commands

Non-login shells miss the toolchain: `export PATH="$HOME/.local/bin:$HOME/.local/share/pnpm/bin:$HOME/.cargo/bin:$PATH"`

| Purpose | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Desktop dev | `pnpm tauri dev` |
| Typecheck + bundle (CI) | `pnpm build` |
| Lint/format (CI) | `pnpm exec biome check .` |
| Frontend tests (CI) | `pnpm vitest run` (expect 29 files / 310 tests) |
| One spec | `pnpm vitest run src/__tests__/design/tokens.test.ts` |
| One test by name | `pnpm vitest run -t "tokens"` |
| Rust fmt (CI) | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` |
| Rust clippy (CI) | `cargo clippy --manifest-path src-tauri/Cargo.toml --locked -- -D warnings` |
| Rust tests (CI) | `cargo test --locked --manifest-path src-tauri/Cargo.toml` |
| Rust one module | `cargo test --manifest-path src-tauri/Cargo.toml --lib credentials` |
| E2E (local only) | `pnpm test:e2e` (boots `tauri dev` + Playwright) |
| Android APK | `pnpm build:android` (needs `ANDROID_NDK_HOME`) |
| Signing secrets | `pnpm secrets:fetch` |

No `pnpm test` script exists; if `pnpm lint` prints "Linter process terminated abnormally", re-run `node node_modules/@biomejs/biome/bin/biome check .`, because that OOM has faked a green exit before.

## Boundaries

### Always do
- Land work as a `feat|fix|chore|docs/...` branch -> PR -> squash-merge -> delete branch. Never push to `main`.
- Add tests for new logic: `src/__tests__/` (mirroring `src/` paths) and a `#[cfg(test)]` mod beside Rust code.
- Keep domain models provider-neutral; keep OPDS/Grimmory specifics in the provider adapter.
- Gate desktop-only peers behind `#[cfg(desktop)]`. Android runs no peer services; only `INTERNET` and `ACCESS_NETWORK_STATE` remain.
- Preserve redaction: `CatalogConfig` has a manual `Debug` printing `***`; `OpdsCredentials` keeps plain `Serialize` and must never reach a log sink.

### Ask first
- Version bumps, tags, releases, deleting remote branches or releases.
- Any change to the Android signing key or the Tauri updater `pubkey`.
- Deleting user content, or dropping it from the local library.
- Adding a runtime dependency or changing an IPC command signature.
- New features: the feature freeze is active and needs a `feature-freeze-exception` issue.

### Never do
- Render EPUBs or add reading UI. ShelfSync downloads and verifies; Leafline reads.
- Identify a publication by filename, local path, title, or unscoped integer id.
- Delete user content automatically; deletion is always explicit.
- Write credentials into source, fixtures, generated files, or committed env files.
- Use private Grimmory endpoints for the primary catalog flow.
- Commit `*.jks`, `keystore.properties`, `keys/`, or `.env.infisical`.
- Remove legacy implementation wholesale before replacement tests cover the retired behaviour.

Credentials live behind the `CredentialCipher` / `CredentialStore` traits in `src-tauri/src/credentials/mod.rs`:
`InMemorySessionStore` on desktop (never touches disk), AES/GCM via Android Keystore JNI on Android (sealed base64
in `opds-credentials.json`, atomic write). `CredentialStoreError::Corrupt` and `::Cipher` mean "prompt re-entry".

## App boundaries

Source of truth for the split with Leafline; the apps share only the EPUB file. Offline states are `complete / downloading / failed / unavailable / superseded`; future progress sync is KOReader-style records.

| Concern | Leafline | ShelfSync |
|---|---|---|
| Purpose | EPUB reading app | OPDS library client, no host role |
| Platform | Native Android (Kotlin, Compose) | Tauri desktop + Android shell |
| Rendering | Readium EPUB | none |
| Catalog | OPDS client only | browse, authenticated download, reconcile |
| Local data | Room: reading position, bookmarks, highlights | SQLite: publications, acquisitions, revisions, download jobs |
| Calibre | out of scope | legacy compatibility layer only |

Leafline must never host a server, mutate a Calibre `metadata.db`, implement OPDS server logic, or duplicate ShelfSync's download-job model beyond what reading needs.

## Project structure

```
src/                            React 19 + TS 5.9 + Vite
  features/opds/                screens and containers
  services/, store/, types/     OPDS clients; Zustand stores; Zod schemas for every IPC payload
  utils/tauri.ts                safeInvoke / safeStoreLoad IPC wrappers
  __tests__/                    Vitest specs mirroring src/ paths
src-tauri/src/
  commands/                     IPC handlers; commands/opds/ splits transport, catalog, download
  opds/                         parser, transport, http_client, acquisition, verify, downloader/, install/
  persist/, offline/            provider-scoped identity + job states; refresh reconciliation
  credentials/                  Cipher/Store traits; Android JNI impl
  core/                         domain logic + Calibre SQLite legacy layer
src-tauri/test/fixtures/opds/   XML fixtures; e2e/ Playwright (local only)
scripts/sync-secrets.js         Infisical -> keystore.properties
src/design/tokens.ts           design tokens; DESIGN.md is the source of truth
```

## Code style

Biome: 2-space indent, 100-column, double quotes, `recommended` rules. Match the surrounding file.
Frontend IPC goes through `safeInvoke`, never bare `invoke`; Rust errors are `thiserror` enums (`anyhow` is not a dependency). See `src/services/opdsClient.ts` and `src-tauri/src/opds/errors.rs`:

```ts
async listCatalogs(): Promise<SavedCatalog[]> {
  return safeInvoke<SavedCatalog[]>("list_saved_catalogs", undefined, []);
}
```
```rust
#[derive(Debug, thiserror::Error)]
pub enum AcquisitionError {
    #[error("Unsupported media type: {0}")]
    UnsupportedMediaType(String),
}
```

## Testing

Vitest + jsdom, specs in `src/__tests__/`, no coverage gate. Mock the Tauri bridge, never the network; copy `src/__tests__/features/opds/OpdsCatalogScreenContainer.test.tsx`:

```tsx
const tauriState = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/utils/tauri", () => ({
  isTauri: () => tauriState.enabled,
  safeInvoke: vi.fn().mockResolvedValue([]), // never a bare vi.fn()
}));
```

A bare `vi.fn()` resolves `undefined`; a component awaiting it and reading `.length` throws *after* the suite reports green, and vitest exits non-zero. Rust tests are hermetic: `opds/live_grimmory_tests.rs` is misleadingly named and parses a committed fixture.

## Git workflow

- Branch `feat|fix|chore|docs/...` referencing an issue; conventional commits, no emojis or em dashes, `Closes #N`. Never commit roadmap or planning docs.
- If `main` CI is red, fix CI on its own branch and merge it first, then rebase dependents (`git rebase main && git push --force-with-lease`).
- Board "ShelfSync Development" (project 6, status field `PVTSSF_lAHOBPhPDc4BhPM5zhgLqQo`): use raw GraphQL via `gh api graphql`; `gh project item-list` errors on this owner type. Complex payloads go through `--input file.json`.

**Done when** every command marked `(CI)` above exits 0 locally and on the PR.

## Release and signing

Infisical is the only source of signing secrets (`/android`: `SHELF_KEYSTORE_BASE64`, `shelfsync.key.{alias,password}`, `shelfsync.keystore.password`; `/tauri`: `TAURI_UPDATER_PRIVATE_KEY_BASE64`). GitHub holds exactly two, `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET`; never add signing material back. `scripts/sync-secrets.js` falls back `INFISICAL_TOKEN` -> `.env.infisical` -> `infisical` CLI and fails closed on bad secrets.

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. All three must match; `verify-version` reads only `tauri.conf.json`.
2. Add a `CHANGELOG.md` entry, then merge through a PR.
3. `git tag -a vX.Y.Z -m "ShelfSync vX.Y.Z" && git push origin vX.Y.Z` - the tag push triggers the workflow as a `prerelease`. For stable, `gh workflow run release.yml --ref main -f tag=vX.Y.Z -f release_type=stable`.

Signing key policy: the Android release key must never rotate - Android refuses updates whose signing certificate differs, so a new key forces every user to uninstall and lose local data. Bad release recovery: re-tag cleanly (`gh release delete vX.Y.Z -y`, delete remote and local tag, re-tag, push) or re-dispatch; `publish` uploads with `--clobber` and keeps curated notes.

Known gap: in-app updates do not work. `bundle.createUpdaterArtifacts` is off (no `.sig`, desktop bundles unsigned); the updater endpoint does not resolve while the newest release is a pre-release; the `/tauri` key is not a valid minisign key.
