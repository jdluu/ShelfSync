use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Json},
};

use super::auth::is_authorized;
use super::SharedState;

#[derive(serde::Deserialize, serde::Serialize)]
pub struct ProgressUpdate {
    pub book_id: i64,
    pub status: String,
}

/// Handler for `GET /api/progress`.
///
/// Returns current reading progress for all books.
/// Requires `Authorization: Bearer <token>` header.
pub async fn get_progress(
    header_map: header::HeaderMap,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    if !is_authorized(&header_map, &state) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    let mut lock = state.progress_db.lock().unwrap();
    if let Some(conn) = lock.as_ref() {
        match crate::core::progress::get_all_progress(conn) {
            Ok(records) => Json(records).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("DB Error: {}", e),
            )
                .into_response(),
        }
    } else {
        // Fallback or uninitialized error
        let app_data_dir = {
            let guard = match state.app_data_dir.lock() {
                Ok(g) => g,
                Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response(),
            };
            guard.clone()
        };
        if let Some(dir) = app_data_dir {
            match crate::core::progress::init_progress_db(&dir) {
                Ok(conn) => {
                    let res = crate::core::progress::get_all_progress(&conn);
                    *lock = Some(conn);
                    match res {
                        Ok(records) => Json(records).into_response(),
                        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("DB Error: {}", e)).into_response(),
                    }
                }
                Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to init db").into_response(),
            }
        } else {
            (StatusCode::SERVICE_UNAVAILABLE, "App data dir not set").into_response()
        }
    }
}

/// Handler for `POST /api/progress`.
///
/// Updates the reading progress/status for a specific book.
/// Requires `Authorization: Bearer <token>` header.
pub async fn update_progress(
    header_map: header::HeaderMap,
    State(state): State<SharedState>,
    Json(payload): Json<ProgressUpdate>,
) -> impl IntoResponse {
    if !is_authorized(&header_map, &state) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    let mut lock = state.progress_db.lock().unwrap();
    if let Some(conn) = lock.as_ref() {
        match crate::core::progress::update_progress(conn, payload.book_id, &payload.status) {
            Ok(_) => StatusCode::OK.into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("DB Error: {}", e),
            )
                .into_response(),
        }
    } else {
        let app_data_dir = {
            let guard = match state.app_data_dir.lock() {
                Ok(g) => g,
                Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response(),
            };
            guard.clone()
        };
        if let Some(dir) = app_data_dir {
            match crate::core::progress::init_progress_db(&dir) {
                Ok(conn) => {
                    let res = crate::core::progress::update_progress(&conn, payload.book_id, &payload.status);
                    *lock = Some(conn);
                    match res {
                        Ok(_) => StatusCode::OK.into_response(),
                        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, format!("DB Error: {}", e)).into_response(),
                    }
                }
                Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to init db").into_response(),
            }
        } else {
            (StatusCode::SERVICE_UNAVAILABLE, "App data dir not set").into_response()
        }
    }
}
