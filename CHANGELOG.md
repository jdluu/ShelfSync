# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 1.0.1 (2026-02-23)

### Features

* **security:** harden Android release builds by disabling cleartext traffic and adding missing updater permissions
* **architecture:** refactor state initialization to correctly use application data directories and consolidate settings persistence via `tauri-plugin-store`
* **database:** migrate local book storage to a native Rust `rusqlite` implementation for improved performance and reliability
* **robustness:** eliminate widespread `.unwrap()` calls in favor of proper error propagation and structured logging
* **config:** stabilize command stripping settings and update capability permissions

## 1.0.0 (2026-02-11)

### Features

* **core:** implement dual-role architecture (Host/Client) with Rust/Tauri backend
* **host:** integrate Calibre library metadata extraction and library indexing
* **client:** implement automated mDNS service discovery for local network hosts
* **sync:** develop background synchronization engine for EPUB files with progress tracking
* **security:** implement 4-digit PIN device pairing and secure pairing mechanism
* **ui:** design responsive frontend using Tailwind CSS, DaisyUI, and Nord theme
* **a11y:** implement skip links, semantic roles, and focus management improvements
* **help:** implement interactive help sidebar with searchable documentation
* **testing:** implement comprehensive Playwright E2E testing suite with dual-window simulation
* **ci/CD:** enable automated GitHub Actions for cross-platform builds and releases

### Bug Fixes

* **ui:** resolve various responsiveness and theme application inconsistencies
* **sync:** fix concurrency issues and panic during high-throughput file transfers
* **discovery:** stabilize mDNS broadcasting on various network configurations
