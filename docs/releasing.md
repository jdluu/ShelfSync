# ShelfSync Release Runbook

## Overview

ShelfSync releases are built and published by the GitHub Actions workflow in `.github/workflows/release.yml`. The workflow is triggered automatically by pushing a `v*` tag or manually via workflow dispatch (`workflow_dispatch`). Signing material is fetched from Infisical at build time and is never stored in the repository.

## Cutting a release

Follow these ordered steps to cut a new release:

1. Bump the version across the three files that must agree:
   - `package.json` (`version`)
   - `src-tauri/Cargo.toml` (`[package]` `version`)
   - `src-tauri/tauri.conf.json` (`version`)
   All three versions must match the release tag. The automated check reads only `src-tauri/tauri.conf.json`: `verify-version` fails if the tag does not equal `v` followed by that version, so keep the other two in sync by hand.

2. Add a `CHANGELOG.md` entry documenting the changes under the new version header, including the date and release status (e.g. pre-release or stable).

3. Open a pull request and merge the changes to `main`. The repository enforces a PR workflow and never commits directly to `main`.

4. Create and push an annotated git tag:
   ```bash
   git tag -a vX.Y.Z -m "ShelfSync vX.Y.Z"
   git push origin vX.Y.Z
   ```
   Pushing a tag matching the `v*` pattern automatically triggers the release workflow with `release_type` set to `prerelease` by default.

5. Alternatively, trigger the workflow manually using the GitHub CLI:
   ```bash
   gh workflow run release.yml --ref main -f tag=vX.Y.Z -f release_type=prerelease
   ```
   For a stable release, pass `-f release_type=stable`.

The `release_type` input accepts either `prerelease` or `stable`. Releases marked as pre-release are excluded from GitHub's `releases/latest` endpoint.

## What the workflow does

The release workflow consists of five jobs executed in order:

1. `validate`
   Runs on `ubuntu-latest`. It sanitizes and validates the tag input against the strict regular expression `^v[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$`. Any tag containing invalid characters (spaces, semicolons, shell substitutions) is rejected before it can reach git. It also validates that `release_type` is either `prerelease` or `stable`. Crucially, only the sanitized tag output produced by this `validate` job is ever passed to `actions/checkout` as `ref:` across downstream jobs, preventing untrusted input from reaching ref resolution.

2. `verify-version`
   Needs `validate`. Runs on `ubuntu-latest`. It checks out the repository at the validated tag ref and verifies that the tag matches `v` concatenated with the version declared in `src-tauri/tauri.conf.json`. If there is any discrepancy, the workflow halts before starting any build jobs.

3. `build-desktop`
   Needs `validate` and `verify-version`. Runs a matrix across `ubuntu-22.04` and `windows-latest`. It installs the respective build dependencies (including WebKitGTK and AppIndicator on Ubuntu), installs frontend dependencies with `pnpm install --frozen-lockfile`, and runs `pnpm tauri build`. This produces unsigned desktop bundles (`.deb`, `.AppImage`, and `.tar.gz` on Ubuntu; `.exe`, `.msi`, and `.zip` on Windows), which are uploaded as build artifacts.

4. `build-android`
   Needs `validate` and `verify-version`. Runs on `ubuntu-latest`. It configures Java 17 (Zulu), the Android SDK, and Rust targets for `aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, and `x86_64-linux-android`. The NDK comes from the runner image (`ubuntu-latest` ships NDK 27.3.13750724 and exports `ANDROID_NDK_HOME`); the workflow installs none of its own. It exchanges the repository secrets `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET` for a short-lived token and runs `pnpm secrets:fetch` to retrieve the Android keystore and properties. It then executes `pnpm tauri android build --apk` and `pnpm tauri android build --aab` to produce signed APK and AAB bundles. Finally, an `always()` post-build cleanup step deletes the injected keystore and property files so no secrets remain on the runner.

5. `publish`
   Needs `validate`, `build-desktop`, and `build-android`. Runs on `ubuntu-latest` with `contents: write` permissions. It downloads all desktop and Android artifacts, merges them, and publishes them to GitHub Releases. If the release already exists for the tag, it attaches the new assets using `gh release upload "$TAG" ... --clobber`, ensuring curated release notes are preserved. If the release does not exist, it creates a new release using `gh release create` (setting the `--prerelease` flag when `release_type` is `prerelease`). After upload, it reads back the release metadata via `gh release view` and fails the job if the release is in draft state (`isDraft != false`), if the `isPrerelease` status does not match `release_type`, or if zero assets were attached.

## Where secrets live

Secret management is strictly separated between Infisical and GitHub:

- **Infisical**: Infisical serves as the single source of truth for all signing credentials and certificates. Android signing secrets reside under the `/android` path: `SHELF_KEYSTORE_BASE64` (base64-encoded PKCS12/JKS keystore), `shelfsync.key.alias`, `shelfsync.key.password`, and `shelfsync.keystore.password`. The Tauri updater private key resides under the `/tauri` path: `TAURI_UPDATER_PRIVATE_KEY_BASE64`.
- **GitHub Repository Secrets**: GitHub stores only two credentials: `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET`. These represent a dedicated machine identity with read-only access to the necessary Infisical paths. During CI execution, these are exchanged via Universal Auth for a short-lived bearer token that exists only within that specific step.
- **Sync Script**: `scripts/sync-secrets.js` is the unified script used by both local development and CI. It writes `src-tauri/gen/android/app/shelfsync-release.jks` and writes configuration into `src-tauri/gen/android/app/keystore.properties`. It configures `shelfsync.keystore.path=shelfsync-release.jks` as a bare filename relative to the Gradle module directory so that the identical configuration works portably across developer workstations and CI runners.
- **Gitignore Protection**: Generated signing files including `keystore.properties`, `*.jks`, and the `keys/` directory are gitignored and must never be committed to source control.

## Local development

To fetch signing secrets locally:

```bash
pnpm secrets:fetch
```

(The script can also be invoked via `pnpm secrets:sync`.)

`scripts/sync-secrets.js` supports three authentication mechanisms, evaluated in order:
1. `INFISICAL_TOKEN` environment variable: when present, the script connects directly to the Infisical REST API (`https://app.infisical.com/api/v4/secrets/...`). It does not require the Infisical CLI to be installed, which is how CI runs it.
2. A local `.env.infisical` file at the repository root: key-value pairs are read to populate environment variables without altering shell state. This file is gitignored.
3. Interactive Infisical CLI session: if no token is set in the environment, the script invokes the local `infisical` CLI binary using the current interactive login session (`infisical login`).

The script fails closed: if any required secret is missing, empty, or fails sanity checks (such as checking for valid JKS/PKCS12 binary headers on the decoded keystore), execution exits with a non-zero status code.

## Signing key policy

The Android release signing key must remain stable for the entire lifetime of the application. Android verifies application updates by asserting that the signing certificate matches the currently installed application package. If the signing key is lost or changed, existing users will be unable to install updates without completely uninstalling the app and losing local data.

Never rotate or regenerate the Android signing key without treating it as a critical, breaking change for all users. Keep exactly one canonical copy of the signing keystore and credentials securely stored in Infisical, and never commit any copy to the repository.

## Known gaps

The current release infrastructure has the following known gaps:

- `bundle.createUpdaterArtifacts` is not enabled in `src-tauri/tauri.conf.json`. Consequently, no updater signature files (`.sig`) are generated, and desktop application bundles remain unsigned.
- The configured updater endpoint in `src-tauri/tauri.conf.json` is `https://github.com/jdluu/ShelfSync/releases/latest/download/latest.json`. This endpoint does not resolve while the latest release is flagged as a pre-release, and current builds do not generate or publish `latest.json`. In-app updates do not function at this time.
- The Tauri updater secret stored in Infisical under `/tauri` (`TAURI_UPDATER_PRIVATE_KEY_BASE64`) is not a valid minisign private key. The private key matching the public key declared in `tauri.conf.json` (`pubkey`) is currently missing.

## Recovering from a bad release

If a release build fails or an erroneous release is published:

1. Fix the underlying defect in a feature or fix branch and merge it to `main` via PR.
2. To re-cut the release:
   - Option A (Clean tag): Delete the existing release on GitHub (`gh release delete vX.Y.Z -y`), delete the remote tag (`git push origin :refs/tags/vX.Y.Z`), delete the local tag (`git tag -d vX.Y.Z`), re-tag the new commit on `main`, and push the tag.
   - Option B (Re-dispatch): If keeping the tag name or rebuilding existing assets, re-dispatch the workflow manually via `gh workflow run release.yml --ref main -f tag=vX.Y.Z -f release_type=prerelease`. Because the `publish` job uploads assets using `gh release upload ... --clobber`, existing asset binaries are overwritten in place while existing release notes and descriptions are preserved.
