# ShelfSync Feature Freeze

Status: **ACTIVE** as of 2026-08-25. Owner: jdluu.

## The freeze line

ShelfSync is feature-complete for its core mission:

> Connect to an OPDS catalog, authenticate, download publications with
> integrity verification, and manage an offline library on Windows, Linux,
> and Android.

Everything below the line is **done**. No new features are accepted above
it except through a written exception (see below).

## In scope (allowed work)

1. **Refactoring** — decomposition of oversized modules, extraction of
   layers, removal of dead/legacy code (Calibre compatibility, P2P remnants).
2. **Stability** — bug fixes, error-handling hardening, race fixes.
3. **Performance** — download throughput, catalog parse latency, render
   virtualization, memory footprint.
4. **Modularity** — provider-adapter boundaries, IPC contract tightening,
   test coverage for existing behavior only.
5. **Security** — credential handling, transport verification, CSP,
   Android storage scoping.
6. **Tooling/CI/docs** — anything that keeps the validation suite honest.

## Out of scope (frozen — do not build)

- Any reading/rendering UI (permanent boundary; see docs/app-boundaries.md).
- New catalog providers beyond generic OPDS + the Grimmory adapter.
- Sync/progress push to readers (deferred to Leafline collaboration later).
- New platforms (iOS, macOS builds).
- New UI paradigms: rethemed navigation, new dashboards, social features.
- Calibre direct-sync features beyond the legacy read-only compat layer.

## Exception process

Open a GitHub issue tagged `feature-freeze-exception` with: the user need,
why it cannot wait until after stabilization, and the blast radius.
Requires explicit approval from the maintainer before any branch is cut.

## Exit criteria for lifting the freeze

Not defined yet. Revisit when: zero open stability issues for one release
cycle, refactoring backlog empty, and CI fully green including e2e.
