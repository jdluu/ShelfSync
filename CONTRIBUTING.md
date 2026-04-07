# Contributing to ShelfSync

Thank you for your interest in contributing to ShelfSync! This guide will help you understand the project structure and how to get started.

## 🏗️ Architecture Overview

ShelfSync is built using the **Tauri** framework, which bridges a **Rust** backend with a **React (TypeScript)** frontend.

### Project Structure
- `src/`: React frontend source code.
- `src-tauri/`: Rust backend source code.
- `e2e/`: Playwright end-to-end tests.
- `wiki/`: In-depth documentation on features and architecture.

### Key Technologies
- **Backend**: Rust, Axum (HTTP Server), SQLite (Local/Remote DB), Tantivy (Full-text Search), mdns-sd (Discovery).
- **Frontend**: React, Vite, Tailwind CSS, DaisyUI, Zustand (State Management), TanStack Query (Data Fetching).

## 🚀 Getting Started

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Node.js](https://nodejs.org/) (v18 or higher)
- [pnpm](https://pnpm.io/installation)
- [Infisical CLI](https://infisical.com/docs/cli/overview) (optional, for release builds)

### Development Workflow
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/jdluu/shelfsync.git
    cd shelfsync
    ```
2.  **Install dependencies**:
    ```bash
    pnpm install
    ```
3.  **Run in development mode**:
    ```bash
    pnpm tauri dev
    ```
    This will start the Vite dev server and the Tauri application simultaneously.

## 📋 Coding Standards

### Linting & Formatting
We use **Biome** for both frontend and backend (where applicable) formatting and linting.
- Run checks: `pnpm check`
- Auto-fix: `pnpm format`

### TypeScript Guidelines
- Use strict typing. Avoid `any`.
- Define data models in `src/types/core.ts`.
- Use Zod schemas in `src/types/schemas.ts` for runtime validation of IPC data.

### Rust Guidelines
- Follow idiomatic Rust patterns.
- Use `thiserror` for custom error types.
- Ensure all new Tauri commands are registered in `src-tauri/src/lib.rs`.

## 🧪 Testing

### Unit Tests
- Frontend: `pnpm vitest run`
- Backend: `cd src-tauri && cargo test`

### E2E Tests
- Run all E2E tests: `pnpm test:e2e`
- Note: E2E tests require a display environment or a virtual framebuffer (xvfb) on Linux.

## 📡 Communication Flow

1.  **IPC (Frontend to Local Backend)**: Uses Tauri's `invoke()` system. Handlers are located in `src-tauri/src/commands/`.
2.  **REST (Frontend/Client to Host Backend)**: Uses standard HTTP calls via `apiClient.ts`. The host runs an Axum server (see `src-tauri/src/http/`).
3.  **Events (Backend to Frontend)**: Uses Tauri's `emit()` for asynchronous updates like sync progress.

## 🛠️ Build & Release
- Desktop: `pnpm tauri build`
- Android: `pnpm build:android` (requires keystore configuration)

For more detailed information, please refer to the [Wiki](wiki/Home.md).
