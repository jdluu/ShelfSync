# API Reference

The ShelfSync backend provides a set of IPC (Inter Process Communication) commands and a REST API for host client communication.

## Backend Commands (Tauri IPC)

### Library Commands
- `get_books(libraryPath: string)`: Returns an array of Book objects from the Calibre database.
- `set_library_path(path: string)`: Updates the root library path in the application settings.
- `start_bulk_sync(bookIds: number[])`: Initiates the synchronization process for multiple books.

### Network Commands
- `get_connection_info()`: Returns the local IP and port of the Host instance.
- `discover_hosts()`: Scans the network and returns available ShelfSync instances.

## Host REST API
The Host instance dynamically selects an available port, defaulting to 8080.

### Endpoints
- **GET** `/api/manifest`: Returns the full catalog of books available in the Host library. Requires authentication.
- **POST** `/api/check-pin`: Validates a pairing PIN and returns a temporary authentication token.
- **GET** `/api/download/:bookId`: Streams the file content for the specified book ID.

## Database Schema (Local Client)

The Client instance maintains a local SQLite database (`shelfsync_client.db`) with the following table:

### `books` Table
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | INTEGER | Local primary key. |
| `title` | TEXT | Book title. |
| `authors` | TEXT | List of authors. |
| `remote_id` | INTEGER | Original ID from the Host library. |
| `format` | TEXT | File format (e.g., epub). |
| `local_path` | TEXT | Path to the file on the local device. |
| `read_status`| TEXT | Reading state (unread, reading, finished). |
