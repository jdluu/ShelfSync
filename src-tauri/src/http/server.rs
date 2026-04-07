use axum::{routing::get, Router};
use log::{error, info, warn};
use tauri::Emitter;
use tower_http::cors::CorsLayer;

use super::{auth, books, covers, progress, SharedState};

/// Runs the Axum server on the specified port.
/// If the port is in use, it will fall back to port 0 (random available port).
/// Returns the actual port the server bound to, or an error if it failed completely.
pub async fn run(
    state: SharedState,
    preferred_port: u16,
    app_handle: tauri::AppHandle,
) -> Result<u16, String> {
    let app = Router::new()
        .route("/api/status", get(auth::get_status))
        .route("/api/manifest", get(books::get_manifest))
        .route("/api/cover/{book_id}", get(covers::get_cover))
        .route(
            "/api/download/{book_id}/{format}",
            get(books::download_book),
        )
        .route("/api/check-pin", axum::routing::post(auth::check_pin))
        .route(
            "/api/progress",
            get(progress::get_progress).post(progress::update_progress),
        )
        .layer(CorsLayer::permissive())
        .with_state(state.clone());

    if let Ok(mut handle_lock) = state.app_handle.lock() {
        *handle_lock = Some(app_handle.clone());
    }

    // Try preferred port first, fall back to 0 (random) if in use
    let val_preferred = format!("0.0.0.0:{}", preferred_port);
    let listener = match tokio::net::TcpListener::bind(&val_preferred).await {
        Ok(l) => l,
        Err(e) => {
            warn!(
                "Failed to bind to preferred port {}: {}. Falling back to random port.",
                preferred_port, e
            );
            match tokio::net::TcpListener::bind("0.0.0.0:0").await {
                Ok(l) => l,
                Err(e) => {
                    error!("Failed to bind to any port: {}", e);
                    let _ =
                        app_handle.emit("server-error", format!("Failed to start server: {}", e));
                    return Err(e.to_string());
                }
            }
        }
    };

    let actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    info!("Server listening on port {}", actual_port);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            error!("Server error: {}", e);
        }
    });

    Ok(actual_port)
}

#[cfg(test)]
mod tests {
    use super::super::{ServerState, SharedState};
    use super::*;
    use crate::core::db;
    use crate::http::auth::{AuthResponse, PinRequest};
    use axum::http::header;
    use axum_test::TestServer;
    use rusqlite::Connection;
    use std::fs;
    use std::path::Path;
    use std::sync::{Arc, Mutex};
    use tempfile::tempdir;

    /// Generates a minimal mock Calibre library for server tests.
    fn setup_mock_lib(path: &Path) {
        fs::create_dir_all(path).unwrap();
        let db_path = path.join("metadata.db");
        let conn = Connection::open(&db_path).unwrap();

        conn.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT, series INTEGER, series_index REAL, pubdate TEXT)", []).unwrap();
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
        conn.execute(
            "CREATE TABLE comments (id INTEGER PRIMARY KEY, book INTEGER, text TEXT)",
            [],
        )
        .unwrap();
        conn.execute(
            "CREATE TABLE ratings (id INTEGER PRIMARY KEY, rating REAL)",
            [],
        )
        .unwrap();
        conn.execute("CREATE TABLE books_ratings_link (id INTEGER PRIMARY KEY, book INTEGER, rating INTEGER)", []).unwrap();
        conn.execute(
            "CREATE TABLE languages (id INTEGER PRIMARY KEY, lang_code TEXT)",
            [],
        )
        .unwrap();
        conn.execute("CREATE TABLE books_languages_link (id INTEGER PRIMARY KEY, book INTEGER, lang_code INTEGER)", []).unwrap();

        conn.execute("INSERT INTO books (id, title, path, series, series_index, pubdate) VALUES (1, 'Server Test Book', 'test/book', NULL, 1.0, '2023-01-01T00:00:00+00:00')", []).unwrap();
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

    fn make_state(dir: &Path) -> SharedState {
        Arc::new(ServerState {
            library_path: Mutex::new(Some(dir.to_str().unwrap().to_string())),
            db_pool: tokio::sync::RwLock::new(None),
            books: Mutex::new(Vec::new()),
            pin: Mutex::new("1234".to_string()),
            authorized_tokens: Mutex::new({
                let mut set = std::collections::HashSet::new();
                set.insert("test-token".to_string());
                set
            }),
            app_data_dir: Mutex::new(Some(dir.to_path_buf())),
            failed_pin_attempts: Mutex::new((0, std::time::Instant::now())),
            active_cover_resizes: tokio::sync::Mutex::new(std::collections::HashSet::new()),
            progress_db: Mutex::new(None),
            last_metadata_mtime: Mutex::new(None),
            bound_port: Mutex::new(8080),
            is_hosting: Mutex::new(false),
            app_handle: Mutex::new(None),
        })
    }

    async fn populate_books(state: &SharedState, lib_path: &str) {
        let db_path = std::path::Path::new(lib_path).join("metadata.db");
        let cfg = deadpool_sqlite::Config::new(db_path);
        let pool = cfg
            .builder(deadpool_sqlite::Runtime::Tokio1)
            .unwrap()
            .build()
            .unwrap();

        let mut books = state.books.lock().unwrap();
        *books = db::get_calibre_metadata(&pool).await.unwrap();
    }

    #[tokio::test]
    async fn test_manifest() {
        let dir = tempdir().unwrap();
        setup_mock_lib(dir.path());
        let state = make_state(dir.path());
        populate_books(&state, dir.path().to_str().unwrap()).await;

        let app = Router::new()
            .route("/api/manifest", get(books::get_manifest))
            .with_state(state);

        let server = TestServer::new(app);
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
        let state = make_state(dir.path());
        populate_books(&state, dir.path().to_str().unwrap()).await;

        let app = Router::new()
            .route(
                "/api/download/{book_id}/{format}",
                get(books::download_book),
            )
            .with_state(state);

        let server = TestServer::new(app);
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

        let img = image::RgbImage::new(100, 100);
        let cover_path = dir.path().join("test/book/cover.jpg");
        img.save(cover_path).unwrap();

        let state = make_state(dir.path());
        populate_books(&state, dir.path().to_str().unwrap()).await;

        let app = Router::new()
            .route("/api/cover/{book_id}", get(covers::get_cover))
            .with_state(state);

        let server = TestServer::new(app);
        let response = server
            .get("/api/cover/1")
            .add_header(header::AUTHORIZATION, "Bearer test-token")
            .await;

        response.assert_status_ok();
        response.assert_header("content-type", "image/jpeg");
        assert!(!response.as_bytes().is_empty());
    }

    #[tokio::test]
    async fn test_check_pin() {
        let dir = tempdir().unwrap();
        setup_mock_lib(dir.path());
        let state = make_state(dir.path());

        let app = Router::new()
            .route("/api/check-pin", axum::routing::post(auth::check_pin))
            .with_state(state);

        let server = TestServer::new(app);

        let payload = PinRequest {
            pin: "1234".to_string(),
        };
        let bad_payload = PinRequest {
            pin: "9999".to_string(),
        };

        let response = server.post("/api/check-pin").json(&payload).await;
        response.assert_status_ok();
        let auth_resp = response.json::<AuthResponse>();
        assert!(!auth_resp.token.is_empty());

        let response_fail = server.post("/api/check-pin").json(&bad_payload).await;
        response_fail.assert_status(axum::http::StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_progress_endpoints() {
        let dir = tempdir().unwrap();
        setup_mock_lib(dir.path());

        {
            let db_path = dir.path().join("progress.db");
            let conn = Connection::open(&db_path).unwrap();
            conn.execute(
                "CREATE TABLE IF NOT EXISTS progress (
                    book_id INTEGER PRIMARY KEY,
                    status TEXT NOT NULL,
                    last_updated INTEGER NOT NULL
                )",
                [],
            )
            .unwrap();
        }

        let state = make_state(dir.path());

        let app = Router::new()
            .route(
                "/api/progress",
                get(progress::get_progress).post(progress::update_progress),
            )
            .with_state(state);

        let server = TestServer::new(app);

        let payload = crate::http::progress::ProgressUpdate {
            book_id: 1,
            status: "reading".to_string(),
        };

        let update_resp = server
            .post("/api/progress")
            .add_header(header::AUTHORIZATION, "Bearer test-token")
            .json(&payload)
            .await;
        update_resp.assert_status_ok();

        let get_resp = server
            .get("/api/progress")
            .add_header(header::AUTHORIZATION, "Bearer test-token")
            .await;
        get_resp.assert_status_ok();

        #[derive(serde::Deserialize)]
        struct Progress {
            book_id: i64,
            status: String,
        }
        let progress_list = get_resp.json::<Vec<Progress>>();

        assert_eq!(progress_list.len(), 1);
        assert_eq!(progress_list[0].book_id, 1);
        assert_eq!(progress_list[0].status, "reading");
    }
}
