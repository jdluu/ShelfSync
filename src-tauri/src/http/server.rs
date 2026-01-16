use axum::{
    extract::{Path, State},
    response::{Json, IntoResponse, Response},
    body::Body,
    http::{header, StatusCode},
    routing::get,
    Router,
};
use std::sync::{Arc, Mutex};
use std::path::Path as FilePath;
use tower_http::cors::CorsLayer;
use tokio::fs::File;
use tokio_util::io::ReaderStream;
use crate::models::Book;
use log::info;

pub struct ServerState {
    pub library_path: Mutex<Option<String>>,
    pub books: Mutex<Vec<Book>>,
}

pub type SharedState = Arc<ServerState>;

pub async fn run(state: SharedState, port: u16) {
    let app = Router::new()
        .route("/api/manifest", get(get_manifest))
        .route("/api/cover/{book_id}", get(get_cover))
        .route("/api/download/{book_id}/{format}", get(download_book))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let val = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(val).await.unwrap();
    info!("Server listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}
// ...

async fn get_manifest(State(state): State<SharedState>) -> impl IntoResponse {
    // Return cached books directly
    let books = state.books.lock().unwrap();
    Json(books.clone()).into_response()
}

async fn get_cover(
    Path(book_id): Path<i64>,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    let library_path = {
        let guard = state.library_path.lock().unwrap();
        match &*guard {
            Some(p) => p.clone(),
            None => return (StatusCode::SERVICE_UNAVAILABLE, "Library path not set").into_response(),
        }
    };

    let book = {
        let books = state.books.lock().unwrap();
        match books.iter().find(|b| b.id == book_id) {
            Some(b) => b.clone(),
            None => return (StatusCode::NOT_FOUND, "Book not found").into_response(),
        }
    };

    let cover_path = FilePath::new(&library_path).join(&book.path).join("cover.jpg");
    
    if !cover_path.exists() {
        return (StatusCode::NOT_FOUND, "Cover not found").into_response();
    }

    // Offload CPU-intensive image resizing to a blocking thread
    let image_result = tokio::task::spawn_blocking(move || {
        let img = image::open(&cover_path).map_err(|_| "Failed to open image")?;
        // Resize to a reasonable thumbnail size (maintaining aspect ratio)
        // 300x450 is good for the UI cards
        let resized = img.resize(300, 450, image::imageops::FilterType::Lanczos3);
        
        let mut bytes: Vec<u8> = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut bytes);
        resized.write_to(&mut cursor, image::ImageFormat::Jpeg).map_err(|_| "Failed to encode image")?;
        
        Ok::<Vec<u8>, &'static str>(bytes)
    }).await.unwrap();

    match image_result {
        Ok(bytes) => {
            Response::builder()
                .header(header::CONTENT_TYPE, "image/jpeg")
                .body(Body::from(bytes))
                .unwrap()
        },
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response()
    }
}

async fn download_book(
    Path((book_id, format)): Path<(i64, String)>,
    State(state): State<SharedState>,
) -> impl IntoResponse {
     let library_path = {
        let guard = state.library_path.lock().unwrap();
        match &*guard {
            Some(p) => p.clone(),
            None => return (StatusCode::SERVICE_UNAVAILABLE, "Library path not set").into_response(),
        }
    };

    let book = {
        let books = state.books.lock().unwrap();
        match books.iter().find(|b| b.id == book_id) {
            Some(b) => b.clone(),
            None => return (StatusCode::NOT_FOUND, "Book not found").into_response(),
        }
    };

    // Calibre stores files as "Title - Author.fmt" or similar inside the path.
    // We need to look for a file ending with logic .format (e.g. .epub) in the book's directory.
    let book_dir = FilePath::new(&library_path).join(&book.path);
    
    // Read dir to find file
    let mut dir_entries = match tokio::fs::read_dir(&book_dir).await {
        Ok(d) => d,
        Err(_) => return (StatusCode::NOT_FOUND, "Book directory not found").into_response(),
    };

    let target_format = format.to_lowercase();
    let mut found_path = None;

    while let Ok(Some(entry)) = dir_entries.next_entry().await {
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if ext.to_string_lossy().to_lowercase() == target_format {
                found_path = Some(path);
                break;
            }
        }
    }

    let file_path = match found_path {
        Some(p) => p,
        None => return (StatusCode::NOT_FOUND, "Format not found").into_response(),
    };

    match File::open(&file_path).await {
         Ok(file) => {
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);
            
            // Determine content type
            let content_type = match target_format.as_str() {
                "epub" => "application/epub+zip",
                "pdf" => "application/pdf",
                "mobi" => "application/x-mobipocket-ebook",
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
        },
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "File open error").into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum_test::TestServer;
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;
    use rusqlite::Connection;
    use crate::core::db;

    // Helper to generate a mini mock lib for server tests (similar to gen_mock_lib but smaller/scoped)
    fn setup_mock_lib(path: &Path) {
        fs::create_dir_all(path).unwrap();
        let db_path = path.join("metadata.db");
        let conn = Connection::open(&db_path).unwrap();

        conn.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, path TEXT)", []).unwrap();
        conn.execute("CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT)", []).unwrap();
        conn.execute("CREATE TABLE books_authors_link (id INTEGER PRIMARY KEY, book INTEGER, author INTEGER)", []).unwrap();

        conn.execute("INSERT INTO books (id, title, path) VALUES (1, 'Server Test Book', 'test/book')", []).unwrap();
        conn.execute("INSERT INTO authors (id, name) VALUES (1, 'Tester')", []).unwrap();
        conn.execute("INSERT INTO books_authors_link (book, author) VALUES (1, 1)", []).unwrap();
        
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
        let response = server.get("/api/manifest").await;

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
        let response = server.get("/api/download/1/epub").await;

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
        let response = server.get("/api/cover/1").await;

        response.assert_status_ok();
        response.assert_header("content-type", "image/jpeg");
        
        // Ensure we got some bytes back
        let bytes = response.as_bytes();
        assert!(!bytes.is_empty());
    }
}
