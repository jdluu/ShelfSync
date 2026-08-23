//! Mock HTTP server tests for the KOReader progress adapter.

use crate::credentials::OpdsCredentials;
use crate::progress::client::{KoReaderSyncClient, KoReaderSyncConfig};
use crate::progress::model::LocalProgressSnapshot;
use crate::progress::service::{
    ProgressSyncAccount, ProgressSyncService, PullOutcome, PushOutcome,
};
use crate::progress::{ProgressSyncError};
use axum::extract::{Path, State};
use axum::http::{header::AUTHORIZATION, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use base64::Engine;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

const USER: &str = "koreader-reader";
const PASS: &str = "koreader-pass";
const HASH: &str = "d41d8cd98f00b204e9800998ecf8427e";

#[derive(Default)]
struct MockState {
    auth_hits: AtomicUsize,
    get_hits: AtomicUsize,
    put_hits: AtomicUsize,
    seen_auth: Mutex<Vec<Option<String>>>,
    stored_progress: Mutex<Option<serde_json::Value>>,
    forced_response: Mutex<Option<(u16, String)>>,
    put_bodies: Mutex<Vec<(Option<String>, serde_json::Value)>>,
}

impl MockState {
    fn record_auth(&self, headers: &HeaderMap) {
        let header = headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        self.seen_auth.lock().unwrap().push(header);
    }

    fn hits(&self) -> usize {
        self.auth_hits.load(Ordering::SeqCst)
            + self.get_hits.load(Ordering::SeqCst)
            + self.put_hits.load(Ordering::SeqCst)
    }
}

fn respond(state: &MockState, default: impl FnOnce() -> Response) -> Response {
    if let Some((code, body)) = state.forced_response.lock().unwrap().clone() {
        return (
            StatusCode::from_u16(code).expect("valid status"),
            body,
        )
            .into_response();
    }
    default()
}

async fn users_auth(
    State(state): State<Arc<MockState>>,
    headers: HeaderMap,
) -> Response {
    state.auth_hits.fetch_add(1, Ordering::SeqCst);
    state.record_auth(&headers);
    respond(&state, || (StatusCode::OK, "{}".to_string()).into_response())
}

async fn get_progress(
    State(state): State<Arc<MockState>>,
    Path(document): Path<String>,
    headers: HeaderMap,
) -> Response {
    assert_eq!(document.len(), 32, "server must only see hex hash path segments");
    state.get_hits.fetch_add(1, Ordering::SeqCst);
    state.record_auth(&headers);
    respond(&state, || {
        let stored = state.stored_progress.lock().unwrap().clone();
        match stored {
            Some(progress) => (StatusCode::OK, Json(progress)).into_response(),
            None => StatusCode::NOT_FOUND.into_response(),
        }
    })
}

async fn put_progress(
    State(state): State<Arc<MockState>>,
    headers: HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> Response {
    state.put_hits.fetch_add(1, Ordering::SeqCst);
    let auth = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    state.put_bodies.lock().unwrap().push((auth, body));
    respond(&state, || (StatusCode::OK, "{}".to_string()).into_response())
}

fn build_server() -> (axum_test::TestServer, Arc<MockState>) {
    let state = Arc::new(MockState::default());
    let app = Router::new()
        .route("/users/auth", get(users_auth))
        .route("/syncs/progress/{document}", get(get_progress))
        .route("/syncs/progress", put(put_progress))
        .with_state(state.clone());
    let server = axum_test::TestServer::builder().http_transport().build(app);
    (server, state)
}

fn make_client(base: &str) -> KoReaderSyncClient {
    let config =
        KoReaderSyncConfig::new(base, OpdsCredentials::new(USER, PASS)).unwrap();
    KoReaderSyncClient::new(config).unwrap()
}

fn enabled_account() -> ProgressSyncAccount {
    ProgressSyncAccount {
        enabled: true,
        device_name: "shelfsync-test".to_string(),
        device_id: "device-42".to_string(),
    }
}

fn local_snapshot(updated_at: i64) -> LocalProgressSnapshot {
    LocalProgressSnapshot {
        percentage: Some(0.42),
        position: Some("page 12".to_string()),
        updated_at_unix_seconds: Some(updated_at),
    }
}

fn expected_basic_header() -> String {
    format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(format!("{USER}:{PASS}"))
    )
}

#[tokio::test]
async fn authorize_sends_basic_auth_and_succeeds() {
    let (server, state) = build_server();
    let client = make_client(server.server_url("/").unwrap().as_str());

    ProgressSyncService::check_connection(&client).await.unwrap();

    assert_eq!(state.auth_hits.load(Ordering::SeqCst), 1);
    let auth = state.seen_auth.lock().unwrap()[0].clone().unwrap();
    assert_eq!(auth, expected_basic_header());
}

#[tokio::test]
async fn authorize_rejection_maps_to_typed_unauthorized() {
    let (server, state) = build_server();
    *state.forced_response.lock().unwrap() = Some((401, String::new()));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let err = ProgressSyncService::check_connection(&client)
        .await
        .unwrap_err();
    assert_eq!(err, ProgressSyncError::Unauthorized);
}

#[tokio::test]
async fn pull_without_remote_progress_reports_none() {
    let (server, state) = build_server();
    let client = make_client(server.server_url("/").unwrap().as_str());

    let outcome = ProgressSyncService::pull(&client, &enabled_account(), HASH, &local_snapshot(100))
        .await
        .unwrap();

    assert_eq!(outcome, PullOutcome::NoRemoteProgress);
    assert_eq!(state.get_hits.load(Ordering::SeqCst), 1);
    assert_eq!(state.put_hits.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn pull_adopts_remote_when_remote_is_newer_even_in_millis() {
    let (server, state) = build_server();
    // Remote timestamp arrives in milliseconds; the local snapshot is newer
    // in raw numbers but older once normalized to seconds.
    *state.stored_progress.lock().unwrap() = Some(serde_json::json!({
        "timestamp": 1_700_000_001_000i64,
        "document": HASH,
        "percentage": 0.75,
        "device": "kobo"
    }));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let outcome = ProgressSyncService::pull(
        &client,
        &enabled_account(),
        HASH,
        &local_snapshot(1_700_000_000),
    )
    .await
    .unwrap();

    match outcome {
        PullOutcome::RemoteNewer(progress) => {
            assert_eq!(progress.timestamp, 1_700_000_001_000);
            assert_eq!(progress.percentage, Some(0.75));
        }
        other => panic!("expected RemoteNewer, got {other:?}"),
    }
}

#[tokio::test]
async fn pull_local_newer_conflict_leaves_both_sides_alone() {
    let (server, state) = build_server();
    *state.stored_progress.lock().unwrap() = Some(serde_json::json!({
        "timestamp": 500,
        "document": HASH,
        "percentage": 0.1
    }));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let outcome =
        ProgressSyncService::pull(&client, &enabled_account(), HASH, &local_snapshot(900))
            .await
            .unwrap();

    match outcome {
        PullOutcome::LocalNewer(remote) => {
            assert_eq!(remote.percentage, Some(0.1));
        }
        other => panic!("expected LocalNewer conflict, got {other:?}"),
    }
    assert_eq!(state.put_hits.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn pull_equal_timestamps_is_in_sync() {
    let (server, state) = build_server();
    // Remote in millis, local in seconds, same instant.
    *state.stored_progress.lock().unwrap() = Some(serde_json::json!({
        "timestamp": 1_700_000_000_000i64,
        "document": HASH,
        "percentage": 0.5
    }));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let outcome = ProgressSyncService::pull(
        &client,
        &enabled_account(),
        HASH,
        &local_snapshot(1_700_000_000),
    )
    .await
    .unwrap();

    assert_eq!(outcome, PullOutcome::InSync);
}

#[tokio::test]
async fn pull_with_no_local_record_adopts_remote() {
    let (server, _state) = build_server();
    let client = make_client(server.server_url("/").unwrap().as_str());
    let mut remote_state = _state.stored_progress.lock().unwrap();
    *remote_state = Some(serde_json::json!({
        "timestamp": 123456,
        "document": HASH,
        "percentage": 0.3
    }));
    drop(remote_state);

    let outcome = ProgressSyncService::pull(
        &client,
        &enabled_account(),
        HASH,
        &LocalProgressSnapshot::default(),
    )
    .await
    .unwrap();

    assert!(matches!(outcome, PullOutcome::RemoteNewer(_)));
}

#[tokio::test]
async fn disabled_account_makes_zero_requests() {
    let (server, state) = build_server();
    let client = make_client(server.server_url("/").unwrap().as_str());
    let mut account = enabled_account();
    account.enabled = false;

    let pulled = ProgressSyncService::pull(&client, &account, HASH, &local_snapshot(10))
        .await
        .unwrap();
    let pushed = ProgressSyncService::push(&client, &account, HASH, &local_snapshot(10))
        .await
        .unwrap();

    assert_eq!(pulled, PullOutcome::Disabled);
    assert_eq!(pushed, PushOutcome::Disabled);
    assert_eq!(state.hits(), 0);
}

#[tokio::test]
async fn push_stores_expected_payload_when_nothing_on_remote() {
    let (server, state) = build_server();
    let client = make_client(server.server_url("/").unwrap().as_str());

    let outcome =
        ProgressSyncService::push(&client, &enabled_account(), HASH, &local_snapshot(1_700_000_000))
            .await
            .unwrap();

    assert_eq!(outcome, PushOutcome::Pushed);
    assert_eq!(state.get_hits.load(Ordering::SeqCst), 1);
    assert_eq!(state.put_hits.load(Ordering::SeqCst), 1);

    let bodies = state.put_bodies.lock().unwrap();
    let (auth, body) = &bodies[0];
    assert_eq!(auth.as_deref(), Some(expected_basic_header().as_str()));
    assert_eq!(body["document"], HASH);
    assert_eq!(body["timestamp"], 1_700_000_000);
    assert_eq!(body["percentage"], 0.42);
    assert_eq!(body["progress"], "page 12");
    assert_eq!(body["device"], "shelfsync-test");
    assert_eq!(body["device_id"], "device-42");
}

#[tokio::test]
async fn push_is_suppressed_when_remote_is_strictly_newer() {
    let (server, state) = build_server();
    *state.stored_progress.lock().unwrap() = Some(serde_json::json!({
        "timestamp": 1_700_000_002_000i64,
        "document": HASH,
        "percentage": 0.9
    }));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let outcome = ProgressSyncService::push(
        &client,
        &enabled_account(),
        HASH,
        &local_snapshot(1_700_000_001),
    )
    .await
    .unwrap();

    // Remote arrives in milliseconds and normalizes to 1700000002 seconds,
    // strictly newer than the local second-precision record, so the push
    // must be suppressed.
    match outcome {
        PushOutcome::RemoteNewer(remote) => assert_eq!(remote.timestamp, 1_700_000_002_000),
        other => panic!("expected RemoteNewer suppression, got {other:?}"),
    }
    assert_eq!(state.put_hits.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn push_skips_redundant_write_on_equal_timestamps() {
    let (server, state) = build_server();
    *state.stored_progress.lock().unwrap() = Some(serde_json::json!({
        "timestamp": 777,
        "document": HASH,
        "percentage": 0.42
    }));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let outcome = ProgressSyncService::push(&client, &enabled_account(), HASH, &local_snapshot(777))
        .await
        .unwrap();

    assert_eq!(outcome, PushOutcome::NoChange);
    assert_eq!(state.put_hits.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn push_overwrites_remote_only_when_local_is_newer() {
    let (server, state) = build_server();
    *state.stored_progress.lock().unwrap() = Some(serde_json::json!({
        "timestamp": 100,
        "document": HASH,
        "percentage": 0.05
    }));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let outcome =
        ProgressSyncService::push(&client, &enabled_account(), HASH, &local_snapshot(200))
            .await
            .unwrap();

    assert_eq!(outcome, PushOutcome::Pushed);
    assert_eq!(state.put_hits.load(Ordering::SeqCst), 1);
    let (_, body) = &state.put_bodies.lock().unwrap()[0];
    assert_eq!(body["percentage"], 0.42);
}

#[tokio::test]
async fn push_requires_local_percentage_before_any_request() {
    let (server, state) = build_server();
    let client = make_client(server.server_url("/").unwrap().as_str());
    let snapshot = LocalProgressSnapshot {
        percentage: None,
        position: None,
        updated_at_unix_seconds: Some(50),
    };

    let err = ProgressSyncService::push(&client, &enabled_account(), HASH, &snapshot)
        .await
        .unwrap_err();

    assert!(matches!(err, ProgressSyncError::InvalidInput(_)));
    assert_eq!(state.hits(), 0);
}

#[tokio::test]
async fn sync_endpoint_auth_failure_maps_to_typed_error() {
    let (server, state) = build_server();
    *state.forced_response.lock().unwrap() = Some((401, String::new()));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let err = ProgressSyncService::pull(&client, &enabled_account(), HASH, &local_snapshot(1))
        .await
        .unwrap_err();

    assert_eq!(err, ProgressSyncError::Unauthorized);

    let err = ProgressSyncService::push(&client, &enabled_account(), HASH, &local_snapshot(1))
        .await
        .unwrap_err();
    assert_eq!(err, ProgressSyncError::Unauthorized);
}

#[tokio::test]
async fn malformed_progress_body_maps_to_malformed() {
    let (server, state) = build_server();
    *state.forced_response.lock().unwrap() = Some((200, "<html>not json</html>".to_string()));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let err = ProgressSyncService::pull(&client, &enabled_account(), HASH, &local_snapshot(1))
        .await
        .unwrap_err();

    assert!(matches!(err, ProgressSyncError::Malformed(_)));
}

#[tokio::test]
async fn redirects_are_refused() {
    let (server, state) = build_server();
    *state.forced_response.lock().unwrap() = Some((302, String::new()));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let err = ProgressSyncService::pull(&client, &enabled_account(), HASH, &local_snapshot(1))
        .await
        .unwrap_err();

    assert_eq!(err, ProgressSyncError::Redirect);
}

#[tokio::test]
async fn server_errors_map_to_typed_status() {
    let (server, state) = build_server();
    *state.forced_response.lock().unwrap() = Some((503, String::new()));
    let client = make_client(server.server_url("/").unwrap().as_str());

    let err = ProgressSyncService::pull(&client, &enabled_account(), HASH, &local_snapshot(1))
        .await
        .unwrap_err();

    assert_eq!(err, ProgressSyncError::Server(503));
}

#[tokio::test]
async fn non_hex_document_hash_never_reaches_the_network() {
    let (server, state) = build_server();
    let client = make_client(server.server_url("/").unwrap().as_str());

    let err = ProgressSyncService::pull(&client, &enabled_account(), "../evil", &local_snapshot(1))
        .await
        .unwrap_err();

    assert!(matches!(err, ProgressSyncError::InvalidInput(_)));
    assert_eq!(state.hits(), 0);
}
