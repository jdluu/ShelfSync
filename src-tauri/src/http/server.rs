use crate::models::Book;
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use log::{error, info};
use std::path::Path as FilePath;
use std::sync::{Arc, Mutex};
use tokio::fs::File;
use tokio_util::io::ReaderStream;
use tower_http::cors::CorsLayer;

/// Application state shared across all HTTP handlers.
///
/// Contains the library path, book metadata, authentication PIN, and authorized tokens.
pub struct ServerState {
    /// Path to the Calibre library (e.g., "/Users/name/Calibre Library").
    pub library_path: Mutex<Option<String>>,
    /// In-memory cache of book metadata.
    pub books: Mutex<Vec<Book>>,
    /// 4-digit PIN for initial device pairing.
    pub pin: String,
    /// Set of authorized bearer tokens.
    pub authorized_tokens: Mutex<std::collections::HashSet<String>>,
    /// Directory for storing application data (cache, settings, etc.).
    pub app_data_dir: std::path::PathBuf,
}

pub type SharedState = Arc<ServerState>;

/// Starts the HTTP server on the specified port.
///
/// # Arguments
///
/// * `state` - The shared application state.
/// * `port` - The port to listen on (typically 8080).
pub async fn run(state: SharedState, port: u16) {
    // Generate PIN if not already provided in state (though state is created here usually?)
    // Actually state is passed IN. We should modify how state is created in lib.rs or just read it here.
    // Wait, state is created in lib.rs. I should check lib.rs.
    // I cannot change ServerState struct easily without updating initialization in lib.rs.
    // I will go to lib.rs to initialize the PIN.

    let app = Router::new()
        .route("/api/manifest", get(get_manifest))
        .route("/api/cover/{book_id}", get(get_cover))
        .route("/api/download/{book_id}/{format}", get(download_book))
        .route("/api/check-pin", axum::routing::post(check_pin))
        .route("/api/progress", get(get_progress).post(update_progress))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let val = format!("0.0.0.0:{}", port);
    let listener = match tokio::net::TcpListener::bind(&val).await {
        Ok(l) => l,
        Err(e) => {
            error!("Failed to bind to address {}: {}", val, e);
            return;
        }
    };

    if let Ok(addr) = listener.local_addr() {
        info!("Server listening on {}", addr);
    }

    if let Err(e) = axum::serve(listener, app).await {
        error!("Server error: {}", e);
    }
}
// ...

/// Handler for `GET /api/manifest`.
///
/// Returns the full list of books in the library.
/// Requires `Authorization: Bearer <token>` header.
async fn get_manifest(
    header_map: header::HeaderMap,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    if !is_authorized(&header_map, &state) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    // Return cached books directly
    let books = state.books.lock().unwrap();
    Json(books.clone()).into_response()
}

/// Handler for `GET /api/cover/{book_id}`.
///
/// Returns the cover image for the specified book as a JPEG.
/// Uses a disk-based cache to store resized thumbnails.
/// Requires `Authorization: Bearer <token>` header.
async fn get_cover(
    header_map: header::HeaderMap,
    Path(book_id): Path<i64>,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    if !is_authorized(&header_map, &state) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    let library_path = {
        let guard = state.library_path.lock().unwrap();
        match &*guard {
            Some(p) => p.clone(),
            None => {
                return (StatusCode::SERVICE_UNAVAILABLE, "Library path not set").into_response()
            }
        }
    };

    let book = {
        let books = state.books.lock().unwrap();
        match books.iter().find(|b| b.id == book_id) {
            Some(b) => b.clone(),
            None => return (StatusCode::NOT_FOUND, "Book not found").into_response(),
        }
    };

    let cover_path = FilePath::new(&library_path)
        .join(&book.path)
        .join("cover.jpg");

    if !cover_path.exists() {
        return (StatusCode::NOT_FOUND, "Cover not found").into_response();
    }

    match get_cached_or_resized_cover(&state.app_data_dir, &cover_path, book_id).await {
        Ok(bytes) => Response::builder()
            .header(header::CONTENT_TYPE, "image/jpeg")
            .body(Body::from(bytes))
            .unwrap(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// Handler for `GET /api/download/{book_id}/{format}`.
///
/// Downloads the book file in the requested format (e.g., "epub", "pdf").
/// Searches for the file in the book's directory, falling back to other common formats if the requested one is not found.
/// Requires `Authorization: Bearer <token>` header.
async fn download_book(
    header_map: header::HeaderMap,
    Path((book_id, format)): Path<(i64, String)>,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    if !is_authorized(&header_map, &state) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    let library_path = {
        let guard = state.library_path.lock().unwrap();
        match &*guard {
            Some(p) => p.clone(),
            None => {
                return (StatusCode::SERVICE_UNAVAILABLE, "Library path not set").into_response()
            }
        }
    };

    let book = {
        let books = state.books.lock().unwrap();
        match books.iter().find(|b| b.id == book_id) {
            Some(b) => b.clone(),
            None => return (StatusCode::NOT_FOUND, "Book not found").into_response(),
        }
    };

    let book_dir = FilePath::new(&library_path).join(&book.path);

    let (file_path, found_format) = match find_book_file(&book_dir, &format).await {
        Some(res) => res,
        None => {
            return (
                StatusCode::NOT_FOUND,
                "Format not found (checked: epub, pdf, mobi, cbz)",
            )
                .into_response()
        }
    };

    match File::open(&file_path).await {
        Ok(file) => {
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            // Determine content type
            let content_type = match found_format.as_str() {
                "epub" => "application/epub+zip",
                "pdf" => "application/pdf",
                "mobi" => "application/x-mobipocket-ebook",
                "cbz" => "application/vnd.comicbook+zip",
                _ => "application/octet-stream",
            };

            // Set filename in content-disposition
            let filename = file_path.file_name().unwrap().to_string_lossy().to_string();
            let disposition = format!("attachment; filename=\"{}\"", filename);

            Response::builder()
                .header(header::CONTENT_TYPE, content_type)
                .header(header::CONTENT_DISPOSITION, disposition)
                .body(body)
                .unwrap()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "File open error").into_response(),
    }
}

// Helper functions

/// Helper to retrieve a cover image from cache or resize it from the source.
///
/// # Arguments
///
/// * `app_data_dir` - The application data directory where cache is stored.
/// * `cover_path` - The absolute path to the source cover image.
/// * `book_id` - The unique ID of the book, used for cache filenames.
///
/// # Returns
///
/// Returns `Ok(Vec<u8>)` containing the JPEG bytes, or an error string.
async fn get_cached_or_resized_cover(
    app_data_dir: &std::path::Path,
    cover_path: &std::path::Path,
    book_id: i64,
) -> Result<Vec<u8>, String> {
    // Cache logic: app_data_dir/cache/covers/{book_id}.jpg
    let cache_dir = app_data_dir.join("cache").join("covers");
    let cache_file_path = cache_dir.join(format!("{}.jpg", book_id));

    // 1. Try serving from cache first
    if cache_file_path.exists() {
        if let Ok(bytes) = tokio::fs::read(&cache_file_path).await {
            return Ok(bytes);
        }
    }

    // 2. If not in cache, resize and save
    let cover_path_owned = cover_path.to_path_buf();
    let cache_dir_owned = cache_dir.clone();
    let cache_file_path_owned = cache_file_path.clone();

    // Offload CPU-intensive image resizing to a blocking thread
    tokio::task::spawn_blocking(move || {
        // Ensure cache directory exists
        std::fs::create_dir_all(&cache_dir_owned).map_err(|_| "Failed to create cache dir")?;

        let img = image::open(&cover_path_owned).map_err(|_| "Failed to open image")?;
        // Resize to a reasonable thumbnail size (maintaining aspect ratio)
        // 300x450 is good for the UI cards
        let resized = img.resize(300, 450, image::imageops::FilterType::Lanczos3);

        // Save to cache
        resized
            .save(&cache_file_path_owned)
            .map_err(|_| "Failed to save to cache")?;

        // Write to bytes for response
        let mut bytes: Vec<u8> = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut bytes);
        resized
            .write_to(&mut cursor, image::ImageFormat::Jpeg)
            .map_err(|_| "Failed to encode image")?;

        Ok::<Vec<u8>, String>(bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Helper to find a book file in the specified directory.
///
/// Searches for files matching the requested format (case-insensitive).
/// If the requested format i not found, searches for a set of fallback formats (epub, pdf, mobi, cbz).
///
/// # Returns
///
/// Returns `Some((PathBuf, String))` containing the path and the found format, or `None`.
async fn find_book_file(
    book_dir: &std::path::Path,
    requested_format: &str,
) -> Option<(std::path::PathBuf, String)> {
    // Fallback order: requested -> epub -> pdf -> mobi -> cbz
    let mut search_formats = vec![requested_format.to_lowercase()];
    for f in ["epub", "pdf", "mobi", "cbz"] {
        if !search_formats.contains(&f.to_string()) {
            search_formats.push(f.to_string());
        }
    }

    let mut found_path = None;
    let mut found_format = String::new();

    // Re-scanning dir for each format is inefficient but safe and simple for small dirs
    for fmt in search_formats {
        let mut dir_entries = match tokio::fs::read_dir(book_dir).await {
            Ok(d) => d,
            Err(_) => return None,
        };

        while let Ok(Some(entry)) = dir_entries.next_entry().await {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if ext.to_string_lossy().to_lowercase() == fmt {
                    found_path = Some(path);
                    found_format = fmt;
                    break;
                }
            }
        }
        if found_path.is_some() {
            break;
        }
    }

    found_path.map(|p| (p, found_format))
}

#[derive(serde::Deserialize)]
struct PinRequest {
    pin: String,
}

#[derive(serde::Serialize)]
struct AuthResponse {
    token: String,
}

/// Handler for `POST /api/check-pin`.
///
/// Verifies the 4-digit PIN provided by the client.
/// If correct, returns a new bearer token for subsequent requests.
async fn check_pin(
    State(state): State<SharedState>,
    Json(payload): Json<PinRequest>,
) -> impl IntoResponse {
    if payload.pin == state.pin {
        let token = uuid::Uuid::new_v4().to_string();
        state
            .authorized_tokens
            .lock()
            .unwrap()
            .insert(token.clone());
        (StatusCode::OK, Json(AuthResponse { token })).into_response()
    } else {
        (StatusCode::UNAUTHORIZED, "Invalid PIN").into_response()
    }
}

/// Handler for `GET /api/progress`.
///
/// Returns current reading progress for all books.
/// Requires `Authorization: Bearer <token>` header.
async fn get_progress(
    header_map: header::HeaderMap,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    if !is_authorized(&header_map, &state) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    match crate::core::progress::get_all_progress(&state.app_data_dir) {
        Ok(records) => Json(records).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("DB Error: {}", e),
        )
            .into_response(),
    }
}

#[derive(serde::Deserialize)]
struct ProgressUpdate {
    book_id: i64,
    status: String,
}

/// Handler for `POST /api/progress`.
///
/// Updates the reading progress/status for a specific book.
/// Requires `Authorization: Bearer <token>` header.
async fn update_progress(
    header_map: header::HeaderMap,
    State(state): State<SharedState>,
    Json(payload): Json<ProgressUpdate>,
) -> impl IntoResponse {
    if !is_authorized(&header_map, &state) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    match crate::core::progress::update_progress(
        &state.app_data_dir,
        payload.book_id,
        &payload.status,
    ) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("DB Error: {}", e),
        )
            .into_response(),
    }
}

/// Validates the `Authorization` header against the set of authorized tokens.
fn is_authorized(headers: &header::HeaderMap, state: &SharedState) -> bool {
    if let Some(auth_header) = headers.get(header::AUTHORIZATION) {
        if let Ok(auth_str) = auth_header.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                return state.authorized_tokens.lock().unwrap().contains(token);
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::db;
    use axum_test::TestServer;
    use rusqlite::Connection;
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;

    // Helper to generate a mini mock lib for server tests (similar to gen_mock_lib but smaller/scoped)
    fn setup_mock_lib(path: &Path) {
        fs::create_dir_all(path).unwrap();
        let db_path = path.join("metadata.db");
        let conn = Connection::open(&db_path).unwrap();

        // Create all tables required by get_calibre_metadata query
        conn.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, series INTEGER, series_index REAL)", []).unwrap();
        conn.execute(
            "CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)",
            [],
        )
        .unwrap();
        conn.execute("CREATE TABLE books_authors_link (id INTEGER PRIMARY KEY, book INTEGER, author INTEGER)", []).unwrap();
        conn.execute(
            "CREATE TABLE series (id INTEGER PRIMARY KEY, name TEXT)",
            [],
        )
        .unwrap();
        conn.execute("CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT)", [])
            .unwrap();
        conn.execute(
            "CREATE TABLE books_tags_link (id INTEGER PRIMARY KEY, book INTEGER, tag INTEGER)",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE publishers (id INTEGER PRIMARY KEY, name TEXT)",
            [],
        )
        .unwrap();
        conn.execute("CREATE TABLE books_publishers_link (id INTEGER PRIMARY KEY, book INTEGER, publisher INTEGER)", []).unwrap();
        conn.execute(
            "CREATE TABLE data (id INTEGER PRIMARY KEY, book INTEGER, format TEXT)",
            [],
        )
        .unwrap();

        // Insert test data
        conn.execute("INSERT INTO books (id, title, path, series, series_index) VALUES (1, 'Server Test Book', 'test/book', NULL, 1.0)", []).unwrap();
        conn.execute("INSERT INTO authors (id, name) VALUES (1, 'Tester')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO books_authors_link (book, author) VALUES (1, 1)",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO data (book, format) VALUES (1, 'EPUB')", [])
            .unwrap();

        let book_dir = path.join("test/book");
        fs::create_dir_all(&book_dir).unwrap();
        fs::write(book_dir.join("book.epub"), "dummy content").unwrap();
        fs::write(book_dir.join("cover.jpg"), "fake cover").unwrap();
    }

    #[tokio::test]
    async fn test_manifest() {
        let dir = tempdir().unwrap();
        setup_mock_lib(dir.path());

        let state = Arc::new(ServerState {
            library_path: Mutex::new(Some(dir.path().to_str().unwrap().to_string())),
            books: Mutex::new(Vec::new()),
            pin: "1234".to_string(),
            authorized_tokens: Mutex::new({
                let mut set = std::collections::HashSet::new();
                set.insert("test-token".to_string());
                set
            }),
            app_data_dir: dir.path().to_path_buf(),
        });

        // Pre-populate cache because get_manifest now reads from cache!
        {
            let mut books = state.books.lock().unwrap();
            *books = db::get_calibre_metadata(dir.path().to_str().unwrap()).unwrap();
        }

        let app = Router::new()
            .route("/api/manifest", get(get_manifest))
            .with_state(state);

        let server = TestServer::new(app).unwrap();
        let response = server
            .get("/api/manifest")
            .add_header(header::AUTHORIZATION, "Bearer test-token")
            .await;

        response.assert_status_ok();
        let json = response.json::<Vec<crate::models::Book>>();
        assert_eq!(json.len(), 1);
        assert_eq!(json[0].title, "Server Test Book");
    }

    #[tokio::test]
    async fn test_download_book() {
        let dir = tempdir().unwrap();
        setup_mock_lib(dir.path());

        let state = Arc::new(ServerState {
            library_path: Mutex::new(Some(dir.path().to_str().unwrap().to_string())),
            books: Mutex::new(Vec::new()),
            pin: "1234".to_string(),
            authorized_tokens: Mutex::new({
                let mut set = std::collections::HashSet::new();
                set.insert("test-token".to_string());
                set
            }),
            app_data_dir: dir.path().to_path_buf(),
        });

        // Pre-populate cache
        {
            let mut books = state.books.lock().unwrap();
            *books = db::get_calibre_metadata(dir.path().to_str().unwrap()).unwrap();
        }

        let app = Router::new()
            .route("/api/download/{book_id}/{format}", get(download_book))
            .with_state(state);

        let server = TestServer::new(app).unwrap();
        let response = server
            .get("/api/download/1/epub")
            .add_header(header::AUTHORIZATION, "Bearer test-token")
            .await;

        response.assert_status_ok();
        response.assert_text("dummy content");
        response.assert_header("content-type", "application/epub+zip");
    }

    #[tokio::test]
    async fn test_get_cover() {
        let dir = tempdir().unwrap();
        setup_mock_lib(dir.path());

        // Create a real (small) image file for resizing test
        let img = image::RgbImage::new(100, 100);
        let cover_path = dir.path().join("test/book/cover.jpg");
        img.save(cover_path).unwrap();

        let state = Arc::new(ServerState {
            library_path: Mutex::new(Some(dir.path().to_str().unwrap().to_string())),
            books: Mutex::new(Vec::new()),
            pin: "1234".to_string(),
            authorized_tokens: Mutex::new({
                let mut set = std::collections::HashSet::new();
                set.insert("test-token".to_string());
                set
            }),
            app_data_dir: dir.path().to_path_buf(),
        });

        // Pre-populate cache
        {
            let mut books = state.books.lock().unwrap();
            *books = db::get_calibre_metadata(dir.path().to_str().unwrap()).unwrap();
        }

        let app = Router::new()
            .route("/api/cover/{book_id}", get(get_cover))
            .with_state(state);

        let server = TestServer::new(app).unwrap();
        let response = server
            .get("/api/cover/1")
            .add_header(header::AUTHORIZATION, "Bearer test-token")
            .await;

        response.assert_status_ok();
        response.assert_header("content-type", "image/jpeg");

        // Ensure we got some bytes back
        let bytes = response.as_bytes();
        assert!(!bytes.is_empty());
    }
}
