# Android Hardening Notes

Status: Milestone 7 implementation notes for the Grimmory client roadmap.
Scope: OPDS credential storage, legacy permission and service removal,
download lifecycle on Android, and restart safety guarantees.

## Verified targets

| Target | Command | Result |
|---|---|---|
| Desktop (x86_64-unknown-linux-gnu) | `cargo test --manifest-path src-tauri/Cargo.toml` | 200 passed |
| Desktop (x86_64-unknown-linux-gnu) | `cargo check --manifest-path src-tauri/Cargo.toml` | pass |
| Web frontend | `pnpm vitest run` | 147 passed |
| Android (aarch64-linux-android) | `cargo check --target aarch64-linux-android --lib` | blocked, see below |

The Android Rust cross-check is blocked by this environment, not by the code.
`rustup target add aarch64-linux-android` succeeds and dependency resolution
for the target completes, but build scripts of native dependencies (bundled
SQLite, ring) require the NDK C toolchain (`aarch64-linux-android-clang`),
which is not installed here. With `ANDROID_NDK_HOME` configured the same
command should be run before release. The android-only JNI module was type
checked against `jni 0.21.1` on the host target to validate its API usage;
runtime verification still requires a device or emulator smoke test.

## OPDS credential storage

### Evaluation

1. Official Tauri keystore plugin: none exists today. The Tauri plugins
   ecosystem has no maintained Android Keystore plugin, so the "use a plugin"
   option is unavailable.
2. tauri-plugin-stronghold: encrypted at-rest storage, but it is keyed by a
   password that we would have to persist somewhere, which moves the problem
   rather than solving it.
3. Encrypted storage keyed by the Android Keystore (chosen): an AES/GCM key is
   generated inside the Android Keystore with
   `setBlockModes(GCM)`, `setEncryptionPaddings(NONE)`, and no user gate.
   Plaintext secrets are sealed and opened in Kotlin
   (`SecureCredentials.kt`); Rust exchanges only opaque base64 blobs over JNI
   (`src-tauri/src/credentials/android_keystore.rs`). Ciphertext lives in a
   JSON file inside app-private storage (`opds-credentials.json`), so device
   encryption plus the non-exportable key protect the data at rest.

### Abstraction

All of this sits behind two traits in `src-tauri/src/credentials/mod.rs`:

- `CredentialCipher`: `seal(plaintext)` and `open(sealed)` with no key export.
- `CredentialStore`: `save`, `load`, `delete`, keyed by provider, origin, and
  username.

Implementations:

- `InMemorySessionStore`: desktop default. Session scoped, nothing touches
  disk, matching the pre-hardening flow where credentials live only in the UI
  session and are passed per command call.
- `EncryptedFileStore<C>`: persists sealed blobs atomically (temp file plus
  rename). A corrupted file reports `CredentialStoreError::Corrupt`; a lost or
  rotated keystore key surfaces as `CredentialStoreError::Cipher` on load so
  callers can prompt for re-entry instead of failing silently.
- `MockKeystoreCipher`: deterministic XOR plus base64 cipher used by unit
  tests to emulate keystore loss across instances.

Tauri commands: `opds_save_credential`, `opds_load_credential`,
`opds_delete_credential`. On desktop these resolve to the session-only store;
on Android they resolve to the encrypted file store. If opening the encrypted
store fails at startup, the app falls back to the session-only store and logs
an error rather than ever writing plaintext to disk.

The OPDS browse screen currently keeps credentials in component state only.
Automatic session restoration from the secure store is intentionally deferred;
no code path persists OPDS passwords outside this abstraction.

### Leak prevention

- `CatalogConfig` implements `Debug` manually: username and password print as
  `***` in any diagnostic formatting. Serialization also skips both fields.
- `OpdsCredentials` redacts the password in `Debug`. It deliberately keeps a
  plain `Serialize` implementation because loading a stored credential must
  return the real secret to the caller; the type must therefore never be
  passed to logging or tracing sinks.
- Credential store errors are static strings; they never embed account data.
- No `log!` call site receives a password; the transport error sanitizer in
  `commands/opds.rs` maps auth failures to fixed messages.
- Unit tests assert that debug output, serialized output, and the encrypted
  store file never contain the plaintext password.

## Android permission and service audit

Removed (legacy peer architecture only):

- `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`,
  `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`: BLE discovery.
- `CHANGE_WIFI_MULTICAST_STATE`, `ACCESS_WIFI_STATE`: mDNS multicast lock.
- `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`,
  `READ_MEDIA_IMAGES/VIDEO/AUDIO`, `requestLegacyExternalStorage`: old library
  import paths. Downloads now write under app-private storage only, so no
  runtime storage permission is requested.
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `WAKE_LOCK`: served
  `HostForegroundService`, which advertised the peer host role.
- `HostForegroundService.kt` and `SyncWorker.kt` deleted along with their
  manifest entries and the `androidx.work` dependency.
- `MainActivity.kt` no longer acquires multicast locks, starts hosting
  services, schedules auto-sync workers, or prompts for storage permissions.
- Capability audit: `http:default` removed from `capabilities/default.json`;
  the frontend never imports `@tauri-apps/plugin-http` and the Rust side never
  registers the plugin. The unused `tauri-plugin-http` dependency was dropped
  from `Cargo.toml`.

Kept:

- `INTERNET` plus `ACCESS_NETWORK_STATE`: required for OPDS catalog access and
  downloads.
- Leanback feature declarations: launcher visibility only.

Desktop behavior is unchanged: the Axum host server, mDNS discovery, tray,
and BLE modules still compile and start on desktop targets only. In
`lib.rs` setup, the host server and mDNS spawn now sit behind `#[cfg(desktop)]`
so mobile builds do not run peer services that no longer have permissions.

## Download lifecycle

Current implementation: one streamed HTTPS transfer per publication inside
the app process (`download_opds_publication`), written to a unique `.part`
file, renamed after content-type and length checks. The newer verified
pipeline (`download_verified_epub`) adds hash verification, durable job rows,
retry classification, and old-revision retention but currently covers EPUB
only and is not yet wired to a command.

### Backgrounding

Downloads run while the process is scheduled. When Android backgrounds and
freezes the app mid-transfer, the socket dies and the command resolves with a
network error, which emits a `Failed` progress event and shows the failure in
the UI when the user returns. There is no silent half-complete state: the
`.part` fragment is either cleaned up by the downloader's error path or swept
at next startup. Users should keep the app foregrounded for large transfers
until the deferral below lands.

WorkManager or a user-visible foreground service is therefore not wired up in
this milestone. Rationale: the exposed transfer is a single in-process stream
without resumable range support, so surviving backgrounding would require
either a foreground service notification surface or redesigning the pipeline
around WorkManager with HTTP range resume plus durable job rows. That work
belongs with wiring `download_verified_epub` into the command layer, which
already provides the persistence side (job states, interrupted marking).
Deferred deliberately rather than shipping a foreground service that would
reintroduce service permissions this milestone just removed.

### Cancellation

Cancellation now propagates end to end:

- The backend registers a `CancellationToken` per active publication id.
- `opds_cancel_download(publication_id)` cancels the token; the transfer
  future is raced against it, so the response stream stops immediately
  instead of draining in the background, and the slot is released.
- The frontend cancel button invokes the command and resets to idle; a
  cancelled transfer can never report completion.
- A cancelled transfer leaves its `.part` fragment behind by design; sweeping
  it immediately could delete a concurrent transfer's fragment, so cleanup
  waits for the startup sweep, which only runs when nothing is in flight.
  Tests cover token firing mid-stream, registry release, and unknown ids.

### Restart and process death safety

On every startup `restore_library_on_startup` runs before the offline library
becomes available to commands:

1. `recover_interrupted_jobs` marks every `queued` or `running` job row as
   `interrupted` with a finished timestamp and the reason "interrupted by
   application restart". Because the database commit happens before the final
   rename in the verified pipeline, a killed process can never leave a
   complete-looking record without a verified file.
2. `cleanup_stale_part_files` walks the content root and removes only files
   carrying the `.part` marker, through the root containment helper, while no
   download is in flight.
3. Library classification maps `Interrupted` jobs to the failed section of
   the offline library view, so an interrupted download reappears as a visible
   failed entry the user can retry explicitly.

Practical consequences for Android:

- Process death during a download loses only bytes already received; the next
  start reports the job as interrupted and removes partial fragments.
- Complete revisions survive restarts untouched; replacement failures leave
  the previous verified file intact.
- Rotation does not interrupt transfers because they run in the Rust runtime,
  not in activity scope; the progress events are simply re-listened after the
  webview reloads.
