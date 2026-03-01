use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use std::path::Path as FilePath;

use super::auth::is_authorized;
use super::SharedState;

/// Handler for `GET /api/cover/{book_id}`.
///
/// Returns the cover image for the specified book as a JPEG.
/// Uses a disk-based cache to store resized thumbnails.
/// Requires `Authorization: Bearer <token>` header OR `?token=<token>` query parameter.
#[derive(serde::Deserialize)]
pub struct CoverQuery {
    token: Option<String>,
}

pub async fn get_cover(
    header_map: header::HeaderMap,
    Path(book_id): Path<i64>,
    Query(query): Query<CoverQuery>,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    let mut authorized = is_authorized(&header_map, &state);

    // Fallback: check query parameter token if header auth failed
    if !authorized {
        if let Some(ref q_token) = query.token {
            if let Ok(tokens) = state.authorized_tokens.lock() {
                if tokens.contains(q_token) {
                    authorized = true;
                }
            }
        }
    }

    if !authorized {
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

    let cover_path = FilePath::new(&library_path)
        .join(&book.path)
        .join("cover.jpg");

    if !cover_path.exists() {
        return (StatusCode::NOT_FOUND, "Cover not found").into_response();
    }

    let app_data_dir = {
        let guard = match state.app_data_dir.lock() {
            Ok(g) => g,
            Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response(),
        };
        match &*guard {
            Some(p) => p.clone(),
            None => {
                return (StatusCode::SERVICE_UNAVAILABLE, "App data dir not set").into_response()
            }
        }
    };

    match get_cached_or_resized_cover(&app_data_dir, &cover_path, book_id).await {
        Ok(bytes) => Response::builder()
            .header(header::CONTENT_TYPE, "image/jpeg")
            .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
            .body(Body::from(bytes))
            .unwrap_or_else(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to build response",
                )
                    .into_response()
            }),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// Retrieves a cover image from cache or resizes it from the source.
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
    let cache_dir = app_data_dir.join("cache").join("covers");
    let cache_file_path = cache_dir.join(format!("{}.jpg", book_id));

    if cache_file_path.exists() {
        if let Ok(bytes) = tokio::fs::read(&cache_file_path).await {
            return Ok(bytes);
        }
    }

    let cover_path_owned = cover_path.to_path_buf();
    let cache_dir_owned = cache_dir.clone();
    let cache_file_path_owned = cache_file_path.clone();

    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&cache_dir_owned).map_err(|_| "Failed to create cache dir")?;
        resize_and_save_cover(&cover_path_owned, &cache_file_path_owned)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Resizes a cover image to 300×450 and saves the JPEG to the destination path.
fn resize_and_save_cover(
    src_path: &std::path::Path,
    dest_path: &std::path::Path,
) -> Result<Vec<u8>, String> {
    let img = image::open(src_path).map_err(|_| "Failed to open image")?;
    let resized = img.resize(300, 450, image::imageops::FilterType::Lanczos3);

    let mut bytes: Vec<u8> = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut bytes);
    resized
        .write_to(&mut cursor, image::ImageFormat::Jpeg)
        .map_err(|_| "Failed to encode image")?;

    std::fs::write(dest_path, &bytes).map_err(|_| "Failed to save to cache")?;

    Ok(bytes)
}
