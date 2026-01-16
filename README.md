# ShelfSync

ShelfSync is a cross-platform desktop and mobile application designed to facilitate the synchronization of e-book libraries between devices on a local network. Built upon the Tauri framework, it leverages a Rust-based backend for performance and system integration, coupled with a React and TypeScript frontend for a responsive user interface. The application specifically targets Calibre libraries, allowing a central host to serve content to client devices for offline reading.

## System Architecture

The application adheres to a modular architecture that separates concerns between the user interface, domain logic, and infrastructure.

### Backend (Rust)
The backend is constructed using Rust and the Tauri SDK. It is organized into distinct layers to ensure maintainability and type safety:
*   **Core Layer:** Handles domain-specific logic, specifically the interaction with the Calibre SQLite database (`metadata.db`). It utilizes read-only connections to prevent file locking issues and ensure data integrity.
*   **HTTP Layer:** Implements a local REST API using the Axum framework. This layer serves book metadata, covers, and file downloads to authenticated clients. Image processing is offloaded to blocking threads to maintain server responsiveness.
*   **Command Layer:** Serves as the interface between the frontend and backend (IPC). These commands are thin adapters that delegate execution to the Core or HTTP layers.
*   **Infrastructure:** Manages background services, including mDNS (Multicast DNS) for service discovery, allowing devices to locate each other automatically without manual IP configuration.

### Frontend (React + TypeScript)
The frontend is built with React and structured around feature modules rather than technical layers:
*   **Features:** Business logic is encapsulated in feature-specific directories (e.g., `host`, `client`, `discovery`).
*   **Services:** Interaction with the backend is managed through a typed service layer that abstracts the underlying Tauri IPC calls, ensuring strict contract enforcement between Rust and TypeScript.
*   **Storage:** Local configuration and cached data are managed using persistent stores, ensuring state preservation across application restarts.

## Features

*   **Dual-Role Operation:** The application can function as either a Host or a Client, configurable at runtime.
*   **Calibre Integration:** Directly parses standard Calibre library databases to retrieve book metadata, authors, and file paths.
*   **Automated Discovery:** Utilizes mDNS to automatically detect ShelfSync hosts on the local network, eliminating the need for manual connection setup.
*   **Efficient Synchronization:** Supports direct download of e-book files (EPUB) from the host to the client device for offline access.
*   **Optimized Media Delivery:** Server-side image resizing ensures that cover thumbnails are delivered efficiently to mobile clients, reducing bandwidth usage and rendering time.
*   **Real-time Updates:** The client interface updates in real-time as hosts appear or disappear from the network.

## Prerequisites

To build and run this project, the following dependencies must be installed on the development system:

*   **Rust:** The latest stable version of the Rust programming language and Cargo package manager.
*   **Node.js:** A recent version of Node.js (LTS recommended).
*   **Package Manager:** pnpm is the preferred package manager for this project, though npm or yarn may also be used.
*   **System Dependencies:** Platform-specific development libraries required by Tauri (e.g., `libwebkit2gtk-4.0-dev` on Linux, Xcode Command Line Tools on macOS, Visual Studio C++ Build Tools on Windows).

## Installation and Development

1.  Clone the repository to your local machine.
2.  Install frontend dependencies:
    ```bash
    pnpm install
    ```
3.  Start the development server. This command will launch the frontend dev server and compile the Rust backend:
    ```bash
    pnpm tauri dev
    ```

## Building for Production

To create an optimized release build for the current operating system:

```bash
pnpm tauri build
```

The build artifacts will be located in the `src-tauri/target/release/bundle` directory.

## Usage Guide

### Host Mode
1.  Launch the application and select "Host" from the role selection screen.
2.  Click "Select Library" and navigate to the root folder of an existing Calibre library (the folder containing `metadata.db`).
3.  The application will index the library and begin broadcasting its presence on the local network.
4.  A QR code and connection details will be displayed for manual connections if automatic discovery is not available.

### Client Mode
1.  Launch the application and select "Client" from the role selection screen.
2.  The application will automatically scan the network for available ShelfSync hosts.
3.  Click on a discovered host to connect and view its library manifest.
4.  Select a book to download it to the local device. Once downloaded, the book can be opened in the system default e-reader.