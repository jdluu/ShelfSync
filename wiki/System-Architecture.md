# System Architecture

ShelfSync utilizes a modern client host architecture to manage distributed digital libraries. The system is built on top of the Tauri framework, using Rust for system level operations and React for the user interface.

## Core Components

### Host Instance
The Host instance acts as the primary data source. It interfaces directly with a Calibre library on the local filesystem. 
- **Library Management**: Reads Calibre metadata databases (SQLite) and monitors the filesystem for changes.
- **Server Module**: Hosts a secure local web server to serve book files and metadata to clients.
- **Discovery Service**: Broadcasts its presence on the local network to allow clients to find and connect to it automatically.

### Client Instance
The Client instance connects to a Host to browse and synchronize content.
- **Library Browser**: Provides a searchable interface for remote books.
- **Synchronization Engine**: Handles the downloading and local storage of e-book files.
- **Local Database**: Maintains a local SQLite database to track synchronized content and reading progress.

## Network Communication
Communication between instances occurs over HTTP and WebSockets within the local network. 
- **Authentication**: A PIN based pairing system ensures that only authorized clients can access the Host library.
- **Progress Tracking**: Real time synchronization progress is communicated via WebSocket events.

## Data Persistence
The application uses SQLite for all metadata storage. Technical details regarding the database schema can be found in the API Reference section.
