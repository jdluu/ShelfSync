# AGENTS.md — ShelfSync Development Notes

Internal notes for AI agents and developers working on this repository.
Not user-facing; users should read `README.md`.

## What this project is

ShelfSync is a **Grimmory/OPDS library client**: browse a remote OPDS
catalog, authenticate, download publications with verification, and manage
an offline library. It is built on Tauri 2 (Rust backend + React/TypeScript
frontend) and ships on desktop (Windows/Linux) and Android.

It is **NOT an EPUB reader**. Reading belongs to the separate **Leafline**
app. See `docs/app-boundaries.md` — it is the strict source of truth for
the division of responsibility between the two apps.

## Hard rules

- Never render EPUBs or add reading UI.
- Never identify books solely by filename, local path, title, or unscoped integer id.
- Never delete user content automatically (deletion is always explicit).
- Never write credentials to source, fixtures, generated files, or committed env files.
  - Credentials live behind two traits in `src-tauri/src/credentials/mod.rs`:
    `CredentialCipher` and `CredentialStore`.
    - Desktop: `InMemorySessionStore` (session-scoped, never touches disk).
    - Android: AES/GCM key in Android Keystore via JNI (`SecureCredentials.kt`
      ↔ `src-tauri/src/credentials/android_keystore.rs`); ciphertext stored as
      sealed base64 blobs in app-private storage (`opds-credentials.json`),
      written atomically (temp file + rename).
    - Corrupt store file → `CredentialStoreError::Corrupt`; lost/rotated key →
      `CredentialStoreError::Cipher` so callers can prompt re-entry.
  - Redaction: `CatalogConfig` has a manual `Debug` printing credentials as
    `***` and skips them when serializing. `OpdsCredentials` redacts password
    in `Debug` but keeps plain `Serialize` — it must NEVER reach a log/trace sink.
- Do not use private Grimmory endpoints for the primary catalog flow.
- Keep domain models provider-neutral; isolate OPDS/Grimmory specifics in the provider adapter.

## Layout map

```
src-tauri/src/
  commands/   Tauri IPC command layer (incl. commands/opds/ with IPC
              sub-modules: transport, auth, catalog, download)
  core/       Domain logic, Calibre SQLite (legacy compatibility layer)
  opds/       OPDS parser, transport, downloader (.part + hash verify +
              atomic rename), acquisition, install, errors, HTTP client
  offline/    Offline maintenance + catalog refresh reconciliation
  persist/    Download-centric persistence: provider-scoped identity,
              revisions, job states, library states
              (complete/downloading/failed/unavailable/superseded)
  credentials/ Secure credential abstraction (see above)

src/          React frontend: features/, components/, hooks/, services/,
              store/ (Zustand), types/ (Zod IPC validation), __tests__/ (Vitest)
e2e/          Playwright
mock_library/ Test fixture library
scripts/      Dev scripts
```

compile and start only under `#[cfg(desktop)]`. Android builds run no peer
services; legacy peer permissions/services were removed (see commit history:
BLE, multicast lock, external storage, foreground service all stripped;
only `INTERNET` + `ACCESS_NETWORK_STATE` remain).

## Build & validation

```bash
pnpm install
pnpm tauri dev            # desktop dev
pnpm vitest run           # frontend tests
pnpm lint                 # Biome
cargo test --manifest-path src-tauri/Cargo.toml     # Rust tests (~200)
pnpm build:android        # Android release build (needs NDK + Infisical secrets: pnpm secrets:fetch)
```

Known environment limitation: `cargo check --target aarch64-linux-android --lib`
requires the NDK toolchain (`aarch64-linux-android-clang`) via
`ANDROID_NDK_HOME`; without it the Android cross-check is blocked by the
environment, not the code. The android-only JNI module can be type-checked on
the host target against `jni 0.21.x`; runtime verification needs a device or
emulator smoke test.

Secrets are managed with Infisical CLI (`infisical login`, then `pnpm secrets:fetch`).

Android cross-compilation is verified with the NDK:
```bash
export ANDROID_NDK_HOME=/path/to/android-ndk-r27c
cargo check --target aarch64-linux-android --lib --manifest-path src-tauri/Cargo.toml
```
A runtime smoke test still needs an attached device or emulator.

## Workflow expectations

- Work happens on feature branches merged via PRs to `main`; issues track work.
- Small, conventional commits that are independently verifiable.
- Run the validation suite before opening a PR.
- Do not remove legacy implementation wholesale until replacement tests cover
  the retired behavior.
