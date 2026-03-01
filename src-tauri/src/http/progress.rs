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

    match crate::core::progress::get_all_progress(&app_data_dir) {
        Ok(records) => Json(records).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("DB Error: {}", e),
        )
            .into_response(),
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

    match crate::core::progress::update_progress(&app_data_dir, payload.book_id, &payload.status) {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("DB Error: {}", e),
        )
            .into_response(),
    }
}
