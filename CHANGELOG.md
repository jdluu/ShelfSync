# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Features

* **core:** implement dual-role architecture (Host/Client) for seamless local book synchronization
* **sync:** develop background engine for EPUB files with real-time progress tracking
* **discovery:** automated mDNS service discovery for easy host connection without manual IP entry
* **security:** implement secure 4-digit PIN device pairing and bearer token authorization
* **architecture:** consolidated state management using native Rust `rusqlite` database and `tauri-plugin-store`
* **ui:** responsive, accessible design using Tailwind CSS, DaisyUI, and Nord theme

### Bug Fixes

* **sync:** resolve "failed to fetch" issues by enabling Android cleartext traffic and binding host to `0.0.0.0`
* **security:** relax Content Security Policy to support various local network addressing schemes
* **robustness:** eliminated widespread `.unwrap()` calls in favor of structured error handling and logging
* **ui:** fixed various layout and theme application inconsistencies across desktop and mobile
