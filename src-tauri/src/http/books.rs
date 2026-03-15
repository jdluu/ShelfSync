use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
};
use std::path::Path as FilePath;
use tokio::fs::File;
use tokio_util::io::ReaderStream;

use super::auth::is_authorized;
use super::SharedState;

/// Handler for `GET /api/manifest`.
///
/// Returns the full list of books in the library.
/// Requires `Authorization: Bearer <token>` header.
pub async fn get_manifest(
    header_map: header::HeaderMap,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    if !is_authorized(&header_map, &state) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    let library_path_opt = {
        let guard = match state.library_path.lock() {
            Ok(g) => g,
            Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response(),
        };
        guard.clone()
    };

    if let Some(library_path) = library_path_opt {
        let db_path = FilePath::new(&library_path).join("metadata.db");
        if let Ok(metadata) = tokio::fs::metadata(&db_path).await {
            if let Ok(mtime) = metadata.modified() {
                let mut needs_refresh = false;
                if let Ok(mut last_mtime_guard) = state.last_metadata_mtime.lock() {
                    if last_mtime_guard.is_none() || last_mtime_guard.unwrap() < mtime {
                        *last_mtime_guard = Some(mtime);
                        needs_refresh = true;
                    }
                }

                if needs_refresh {
                    log::info!("Detected metadata.db change. Reloading books...");
                    let pool_opt = {
                        let pool_guard = state.db_pool.read().await;
                        pool_guard.clone()
                    };
                    if let Some(pool) = pool_opt {
                        if let Ok(new_books) = crate::core::db::get_calibre_metadata(&pool).await {
                            if let Ok(mut books_guard) = state.books.lock() {
                                *books_guard = new_books;
                            }
                        } else {
                            log::error!("Failed to reload Calibre metadata.");
                        }
                    }
                }
            }
        }
    }

    let books = match state.books.lock() {
        Ok(b) => b,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response(),
    };
    Json(books.clone()).into_response()
}

/// Handler for `GET /api/download/{book_id}/{format}`.
///
/// Downloads the book file in the requested format (e.g., "epub", "pdf").
/// Searches for the file in the book's directory, falling back to other common formats
/// if the requested one is not found.
/// Requires `Authorization: Bearer <token>` header.
pub async fn download_book(
    header_map: header::HeaderMap,
    Path((book_id, format)): Path<(i64, String)>,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    if !is_authorized(&header_map, &state) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    let library_path = {
        let guard = match state.library_path.lock() {
            Ok(g) => g,
            Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response(),
        };
        match &*guard {
            Some(p) => p.clone(),
            None => {
                return (StatusCode::SERVICE_UNAVAILABLE, "Library path not set").into_response()
            }
        }
    };

    let book = {
        let books = match state.books.lock() {
            Ok(b) => b,
            Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response(),
        };
        match books.iter().find(|b| b.id == book_id) {
            Some(b) => b.clone(),
            None => return (StatusCode::NOT_FOUND, "Book not found").into_response(),
        }
    };

    // Sanitize path to prevent directory traversal
    let safe_book_path: std::path::PathBuf = FilePath::new(&book.path)
        .components()
        .filter(|c| matches!(c, std::path::Component::Normal(_)))
        .collect();

    let book_dir = FilePath::new(&library_path).join(safe_book_path);

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

    build_file_response(&file_path, &found_format)
        .await
        .into_response()
}

/// Builds a streaming file response with the correct content type and disposition headers.
async fn build_file_response(file_path: &FilePath, found_format: &str) -> axum::response::Response {
    match File::open(file_path).await {
        Ok(file) => {
            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            let content_type = match found_format {
                "epub" => "application/epub+zip",
                "pdf" => "application/pdf",
                "mobi" => "application/x-mobipocket-ebook",
                "cbz" => "application/vnd.comicbook+zip",
                _ => "application/octet-stream",
            };

            let filename = file_path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "download".to_string());
            let disposition = format!("attachment; filename=\"{}\"", filename);

            Response::builder()
                .header(header::CONTENT_TYPE, content_type)
                .header(header::CONTENT_DISPOSITION, disposition)
                .body(body)
                .unwrap_or_else(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Failed to build response",
                    )
                        .into_response()
                })
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "File open error").into_response(),
    }
}

/// Searches the book directory for a file matching the requested format,
/// falling back through epub → pdf → mobi → cbz if the exact format is missing.
async fn find_book_file(
    book_dir: &std::path::Path,
    requested_format: &str,
) -> Option<(std::path::PathBuf, String)> {
    let mut search_formats = vec![requested_format.to_lowercase()];
    for f in ["epub", "pdf", "mobi", "cbz"] {
        if !search_formats.contains(&f.to_string()) {
            search_formats.push(f.to_string());
        }
    }

    let mut entries = Vec::new();
    let mut dir_entries = match tokio::fs::read_dir(book_dir).await {
        Ok(d) => d,
        Err(_) => return None,
    };
    while let Ok(Some(entry)) = dir_entries.next_entry().await {
        entries.push(entry.path());
    }

    for fmt in search_formats {
        for path in &entries {
            if let Some(ext) = path.extension() {
                if ext.to_string_lossy().to_lowercase() == fmt {
                    return Some((path.clone(), fmt));
                }
            }
        }
    }

    None
}
