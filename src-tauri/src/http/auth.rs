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
    let mut rate_limit = match state.failed_pin_attempts.lock() {
        Ok(guard) => guard,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response(),
    };

    let now = std::time::Instant::now();
    
    // Reset failed attempts if older than 5 minutes
    if now.duration_since(rate_limit.1) > std::time::Duration::from_secs(300) {
        rate_limit.0 = 0;
    }

    if rate_limit.0 >= 5 {
        error!("PIN brute-force attempt blocked.");
        return (StatusCode::TOO_MANY_REQUESTS, "Too many failed attempts. Try again later.").into_response();
    }
    
    // We only hold the rate_limit lock, so we must be careful with lock ordering,
    // but the pin lock is acquired cleanly here since it's just a leaf lock.
    let pin = match state.pin.lock() {
        Ok(p) => p.clone(),
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response(),
    };

    let valid = payload.pin == pin;
    
    if valid {
        // Reset rate limit on success
        rate_limit.0 = 0;
        rate_limit.1 = now;
        
        // We can drop the rate limit lock early to avoid deadlocks 
        // with authorized_tokens lock, though unlikely.
        drop(rate_limit);
        
        info!("PIN check: result=accepted");
        let token = uuid::Uuid::new_v4().to_string();
        if let Ok(mut tokens) = state.authorized_tokens.lock() {
            tokens.insert(token.clone());
        } else {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Internal error").into_response();
        }
        info!("PIN accepted. Issued new token.");
        (StatusCode::OK, Json(AuthResponse { token })).into_response()
    } else {
        rate_limit.0 += 1;
        rate_limit.1 = now;
        error!("PIN check: result=rejected");
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
