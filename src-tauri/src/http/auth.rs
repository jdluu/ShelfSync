use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{IntoResponse, Json},
};
use log::{error, info};

use super::SharedState;

#[derive(serde::Deserialize, serde::Serialize)]
pub struct PinRequest {
    pub pin: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct AuthResponse {
    pub token: String,
}

/// Handler for `POST /api/check-pin`.
///
/// Verifies the 4-digit PIN provided by the client.
/// If correct, returns a new bearer token for subsequent requests.
pub async fn check_pin(
    State(state): State<SharedState>,
    Json(payload): Json<PinRequest>,
) -> impl IntoResponse {
    let pin = match state.pin.lock() {
        Ok(p) => p,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response(),
    };
    let valid = payload.pin == *pin;
    info!(
        "PIN check: result={}",
        if valid { "accepted" } else { "rejected" }
    );
    if valid {
        let token = uuid::Uuid::new_v4().to_string();
        if let Ok(mut tokens) = state.authorized_tokens.lock() {
            tokens.insert(token.clone());
        } else {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response();
        }
        info!("PIN accepted. Issued new token.");
        (StatusCode::OK, Json(AuthResponse { token })).into_response()
    } else {
        error!("PIN rejected.");
        (StatusCode::UNAUTHORIZED, "Invalid PIN").into_response()
    }
}

/// Validates the `Authorization` header against the set of authorized tokens.
pub fn is_authorized(headers: &header::HeaderMap, state: &SharedState) -> bool {
    if let Some(auth_header) = headers.get(header::AUTHORIZATION) {
        if let Ok(auth_str) = auth_header.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                if let Ok(tokens) = state.authorized_tokens.lock() {
                    return tokens.contains(token);
                }
                return false;
            }
        }
    }
    false
}
