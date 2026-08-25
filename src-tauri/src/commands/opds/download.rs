use super::transport::sanitize_error_message;
use crate::error::AppError;
use crate::opds::{
    download_file, plan_download_destination, CatalogConfig, DownloadContext, DownloadError,
    Publication,
};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use tauri::{command, AppHandle, Emitter};
use tokio_util::sync::CancellationToken;
use url::Url;

#[derive(Debug, Clone, Serialize)]
pub struct OpdsDownloadProgress {
    pub publication_id: String,
    pub title: String,
    pub bytes_received: u64,
    pub total_bytes: Option<u64>,
    pub status: DownloadStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Starting,
    Downloading,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadResult {
    pub local_path: String,
    pub media_type: String,
}

/// Active download cancellation slots keyed by publication id. The frontend
/// can cancel an in-flight transfer; cancellation propagates to the response
/// stream so the socket is closed instead of silently draining.
static ACTIVE_DOWNLOADS: LazyLock<Mutex<HashMap<String, CancellationToken>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn register_cancellation_slot(publication_id: &str, token: CancellationToken) {
    if let Ok(mut slots) = ACTIVE_DOWNLOADS.lock() {
        slots.insert(publication_id.to_string(), token);
    }
}

fn release_cancellation_slot(publication_id: &str) -> Option<CancellationToken> {
    ACTIVE_DOWNLOADS
        .lock()
        .ok()
        .and_then(|mut slots| slots.remove(publication_id))
}

/// Cancels the active download for a publication. Returns false when no
/// matching transfer is in flight.
#[command]
pub fn opds_cancel_download(publication_id: String) -> bool {
    cancel_download_by_publication_id(&publication_id)
}

pub(crate) fn cancel_download_by_publication_id(publication_id: &str) -> bool {
    let token = ACTIVE_DOWNLOADS
        .lock()
        .ok()
        .and_then(|slots| slots.get(publication_id).cloned());
    match token {
        Some(token) => {
            token.cancel();
            true
        }
        None => false,
    }
}

/// Races the download future against its cancellation token so a cancelled
/// transfer stops streaming immediately.
pub(crate) async fn run_cancellable_download(
    token: CancellationToken,
    download: impl std::future::Future<Output = Result<std::path::PathBuf, DownloadError>>,
) -> Result<std::path::PathBuf, DownloadError> {
    tokio::select! {
        biased;
        _ = token.cancelled() => Err(DownloadError::Cancelled),
        result = download => result,
    }
}

#[command]
pub async fn download_opds_publication(
    catalog_url: String,
    username: String,
    password: String,
    publication: Publication,
    content_root: String,
    app: AppHandle,
) -> Result<DownloadResult, AppError> {
    let parsed_url = Url::parse(&catalog_url)
        .map_err(|_| AppError::OpdsTransport("Invalid URL: unable to parse".to_string()))?;

    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err(AppError::OpdsTransport(
            "Invalid URL: only HTTP and HTTPS schemes are allowed".to_string(),
        ));
    }

    if !parsed_url.username().is_empty() {
        return Err(AppError::OpdsTransport(
            "Invalid URL: credentials must not be embedded in URL".to_string(),
        ));
    }

    let config = CatalogConfig::new("download", parsed_url.clone(), username, password)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .use_rustls_tls()
        .build()
        .map_err(|e| AppError::OpdsTransport(format!("Failed to build HTTP client: {}", e)))?;

    let context = DownloadContext::new(client, config.clone());

    let content_root_path = std::path::Path::new(&content_root);
    let plan = plan_download_destination(
        content_root_path,
        &publication,
        &config.origin(),
        &parsed_url,
    )
    .map_err(|e| AppError::OpdsTransport(e.to_string()))?;

    let publication_id_orig = publication.id.clone();
    let title_orig = publication.title.clone();

    let cancellation = CancellationToken::new();
    register_cancellation_slot(&publication_id_orig, cancellation.clone());

    let app_clone = app.clone();
    let pub_id_for_cb = publication_id_orig.clone();
    let title_for_cb = title_orig.clone();
    let progress_callback: Option<Box<dyn Fn(u64, Option<u64>) + Send + Sync>> =
        Some(Box::new(move |bytes_received, total_bytes| {
            let status = if bytes_received > 0 {
                DownloadStatus::Downloading
            } else {
                DownloadStatus::Starting
            };

            let payload = OpdsDownloadProgress {
                publication_id: pub_id_for_cb.clone(),
                title: title_for_cb.clone(),
                bytes_received,
                total_bytes,
                status,
            };

            let _ = app_clone.emit("opds-download-progress", payload);
        }));

    let result = run_cancellable_download(
        cancellation.clone(),
        download_file(&plan, &context, content_root_path, progress_callback),
    )
    .await;

    release_cancellation_slot(&publication_id_orig);

    if let Ok(local_path) = result {
        let final_path = local_path.to_string_lossy().to_string();
        let payload = OpdsDownloadProgress {
            publication_id: publication_id_orig.clone(),
            title: title_orig.clone(),
            bytes_received: 0,
            total_bytes: None,
            status: DownloadStatus::Completed,
        };
        let _ = app.emit("opds-download-progress", payload);

        return Ok(DownloadResult {
            local_path: final_path,
            media_type: plan.media_type,
        });
    }

    let err = result.unwrap_err();
    let payload = OpdsDownloadProgress {
        publication_id: publication_id_orig.clone(),
        title: title_orig.clone(),
        bytes_received: 0,
        total_bytes: None,
        status: DownloadStatus::Failed,
    };
    let _ = app.emit("opds-download-progress", payload);

    Err(AppError::OpdsTransport(sanitize_error_message(&err)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{routing::get, Router};
    use axum_test::TestServer;

    #[tokio::test]
    async fn cancellable_download_stops_when_token_fires() {
        use std::path::PathBuf;
        use std::time::Duration;

        let token = CancellationToken::new();
        let never_finishes: std::future::Pending<Result<PathBuf, DownloadError>> =
            std::future::pending();

        let token_for_cancel = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            token_for_cancel.cancel();
        });

        let result = run_cancellable_download(token, never_finishes).await;
        assert!(
            matches!(result, Err(DownloadError::Cancelled)),
            "expected Cancelled, got {result:?}"
        );
    }

    #[tokio::test]
    async fn cancellable_download_returns_result_without_cancellation() {
        use std::path::PathBuf;

        let token = CancellationToken::new();
        let download = std::future::ready(Ok(PathBuf::from("/tmp/book.epub")));

        let result = run_cancellable_download(token, download).await;
        assert_eq!(result.unwrap(), PathBuf::from("/tmp/book.epub"));
    }

    #[tokio::test]
    async fn slow_transfer_is_aborted_by_registered_slot() {
        use crate::opds::{DownloadPlan, MEDIA_TYPE_EPUB};
        use axum::body::Body;
        use axum::response::IntoResponse;
        use std::path::PathBuf;
        use std::time::Duration;

        // A server that dribbles bytes forever; without propagation the
        // transfer would run to completion regardless of cancel calls.
        let handler = || async {
            let throttled = futures_util::stream::unfold(0u32, |counter| async move {
                tokio::time::sleep(Duration::from_millis(50)).await;
                Some((
                    Ok::<_, std::convert::Infallible>(axum::body::Bytes::from_static(b"chunk")),
                    counter + 1,
                ))
            });
            (axum::http::StatusCode::OK, Body::from_stream(throttled)).into_response()
        };

        let app = Router::new().route("/book.epub", get(handler));
        let server = TestServer::builder().http_transport().build(app);
        let base_url = server
            .server_url("/book.epub")
            .map(|u| {
                format!(
                    "{}://{}:{}",
                    u.scheme(),
                    u.host_str().unwrap_or(""),
                    u.port().unwrap_or(80)
                )
            })
            .unwrap();
        let url = Url::parse(&format!("{base_url}/book.epub")).unwrap();

        let dir = tempfile::tempdir().unwrap();
        let config = CatalogConfig::new(
            "download",
            Url::parse(&base_url).unwrap(),
            "user",
            "pass".to_string(),
        )
        .unwrap();
        let context = DownloadContext::new(
            reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .redirect(reqwest::redirect::Policy::none())
                .use_rustls_tls()
                .build()
                .unwrap(),
            config,
        );
        let plan = DownloadPlan {
            url,
            destination: PathBuf::from("book.epub"),
            filename: "book.epub".to_string(),
            media_type: MEDIA_TYPE_EPUB.to_string(),
        };

        let token = CancellationToken::new();
        register_cancellation_slot("cancel-slow-book", token.clone());

        let download = download_file(&plan, &context, dir.path(), None);
        let waiter = {
            let token = token.clone();
            async move {
                tokio::time::sleep(Duration::from_millis(200)).await;
                assert!(cancel_download_by_publication_id("cancel-slow-book"));
                token.cancel();
            }
        };

        let (result, _) = tokio::join!(run_cancellable_download(token, download), waiter);
        assert!(
            matches!(result, Err(DownloadError::Cancelled)),
            "expected the in-flight transfer to abort with Cancelled"
        );

        // The command path releases its slot once the transfer settles; a
        // later cancel must then report no match.
        release_cancellation_slot("cancel-slow-book");
        assert!(!cancel_download_by_publication_id("cancel-slow-book"));
    }

    #[test]
    fn cancel_unknown_publication_reports_no_match() {
        assert!(!cancel_download_by_publication_id("never-started"));
    }
}
