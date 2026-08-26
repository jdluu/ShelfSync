//! End-to-end download pipeline integration tests.
//!
//! Drives the public download API (`download_file` / the verifier-injected
//! variant) against a local axum fixture server through the complete
//! production sequence: HTTP fetch -> .part staging -> content-hash
//! verification -> atomic rename to the final destination. Failure paths
//! assert that no `.part` residue survives and that the reported error
//! variant is the one callers branch on.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::Body;
use axum::http::StatusCode;
use axum::routing::get;
use axum::Router;
use axum_test::TestServer;
use tempfile::TempDir;
use url::Url;

use super::downloader::download_file_with_verifier;
use super::{
    download_file, sha256_file, CatalogConfig, ContentVerifier, DownloadContext, DownloadError,
    DownloadPlan, ProgressCallback, Sha256Verifier, DEFAULT_DOWNLOAD_TIMEOUT_SECS, MEDIA_TYPE_EPUB,
};

const EPUB_CONTENT_TYPE: &str = "application/epub+zip";

/// EPUB-shaped byte payload: ZIP local-file-header magic plus the OPDS
/// mimetype declaration, padded so the transfer spans multiple stream chunks.
fn epub_payload() -> Vec<u8> {
    let mut payload = b"PK\x03\x04mimetypeapplication/epub+zip".to_vec();
    payload.extend_from_slice(&[b'A'; 8192]);
    payload
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn create_download_context(base_url: &str) -> DownloadContext {
    let config = CatalogConfig::new(
        "test",
        Url::parse(base_url).unwrap(),
        "testuser",
        "testpass".to_string(),
    )
    .unwrap();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(DEFAULT_DOWNLOAD_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none())
        .use_rustls_tls()
        .build()
        .unwrap();
    DownloadContext::new(client, config)
}

fn base_url_from_server_url(server_url: &Url) -> String {
    format!(
        "{}://{}:{}",
        server_url.scheme(),
        server_url.host_str().unwrap_or(""),
        server_url.port().unwrap_or(80)
    )
}

fn make_plan(url: Url, filename: &str) -> DownloadPlan {
    DownloadPlan {
        url,
        destination: PathBuf::from(filename),
        filename: filename.to_string(),
        media_type: MEDIA_TYPE_EPUB.to_string(),
    }
}

fn part_files_under(dir: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut pending = vec![dir.to_path_buf()];
    while let Some(current) = pending.pop() {
        let entries = match std::fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if entry.file_name().to_string_lossy().contains(".part") {
                found.push(path);
            }
        }
    }
    found
}

/// Verifier pinning the digest the publication is supposed to have,
/// delegating the actual hashing to the production Sha256Verifier.
struct PinnedSha256 {
    expected_digest: String,
}

impl ContentVerifier for PinnedSha256 {
    fn verify(&self, path: &Path, _expected: Option<&str>) -> Result<(), DownloadError> {
        Sha256Verifier.verify(path, Some(&self.expected_digest))
    }
}

#[tokio::test]
async fn pipeline_stages_part_then_verifies_and_renames_atomically() {
    let payload = epub_payload();
    let body_for_route = payload.clone();
    let app = Router::new().route(
        "/download/pipeline.epub",
        get(move || {
            let body = body_for_route.clone();
            async move {
                (
                    StatusCode::OK,
                    [("content-type", EPUB_CONTENT_TYPE)],
                    Body::from(body),
                )
            }
        }),
    );
    let server = TestServer::builder().http_transport().build(app);
    let download_url = server.server_url("/download/pipeline.epub").unwrap();
    let base_url = base_url_from_server_url(&download_url);

    let temp_dir = TempDir::new().unwrap();
    let dest_root = temp_dir.path();

    let context = create_download_context(&base_url);
    let plan = make_plan(download_url, "pipeline.epub");

    let events: Arc<Mutex<Vec<(u64, Option<u64>)>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    let progress: Option<ProgressCallback> = Some(Box::new(move |received, total| {
        sink.lock().unwrap().push((received, total));
    }));

    let result = download_file(&plan, &context, dest_root, progress).await;

    let final_path = result.expect("full download pipeline must succeed");
    assert_eq!(final_path, dest_root.join("pipeline.epub"));

    let stored = std::fs::read(&final_path).unwrap();
    assert_eq!(stored, payload, "renamed file must hold the served bytes");

    let expected_digest = sha256_hex(&payload);
    assert_eq!(
        sha256_file(&final_path).unwrap(),
        expected_digest,
        "digest over the renamed artifact must match the payload digest"
    );
    Sha256Verifier
        .verify(&final_path, Some(&expected_digest))
        .expect("artifact must pass Sha256Verifier after the rename");

    assert!(
        part_files_under(dest_root).is_empty(),
        "completed pipeline must leave no .part files behind"
    );

    let recorded = events.lock().unwrap().clone();
    assert_eq!(
        recorded.first().copied(),
        Some((0, Some(payload.len() as u64))),
        "progress must start at 0 bytes"
    );
    assert_eq!(
        recorded.last().copied(),
        Some((payload.len() as u64, Some(payload.len() as u64))),
        "progress must end at the full payload size"
    );
}

#[tokio::test]
async fn pipeline_forbidden_response_reports_error_without_residue() {
    let app = Router::new().route(
        "/download/denied.epub",
        get(|| async {
            (
                StatusCode::FORBIDDEN,
                [("content-type", EPUB_CONTENT_TYPE)],
                Body::from("access denied"),
            )
        }),
    );
    let server = TestServer::builder().http_transport().build(app);
    let download_url = server.server_url("/download/denied.epub").unwrap();
    let base_url = base_url_from_server_url(&download_url);

    let temp_dir = TempDir::new().unwrap();
    let dest_root = temp_dir.path();

    let context = create_download_context(&base_url);
    let plan = make_plan(download_url, "denied.epub");

    let result = download_file(&plan, &context, dest_root, None).await;

    assert!(
        matches!(result, Err(DownloadError::Forbidden)),
        "403 must surface as DownloadError::Forbidden, got {:?}",
        result
    );
    assert!(
        !dest_root.join("denied.epub").exists(),
        "rejected download must not create the destination file"
    );
    assert!(
        part_files_under(dest_root).is_empty(),
        "rejected download must leave no .part files behind"
    );
}

#[tokio::test]
async fn pipeline_wrong_content_fails_hash_verification_and_cleans_part() {
    // Server answers 200 with plausible EPUB bytes, but not the bytes of the
    // publication whose digest the caller expects: corrupted mid-transfer.
    let mut served_bytes = epub_payload();
    served_bytes[32] ^= 0xFF;
    let body_for_route = served_bytes.clone();
    let app = Router::new().route(
        "/download/tampered.epub",
        get(move || {
            let body = body_for_route.clone();
            async move {
                (
                    StatusCode::OK,
                    [("content-type", EPUB_CONTENT_TYPE)],
                    Body::from(body),
                )
            }
        }),
    );
    let server = TestServer::builder().http_transport().build(app);
    let download_url = server.server_url("/download/tampered.epub").unwrap();
    let base_url = base_url_from_server_url(&download_url);

    let temp_dir = TempDir::new().unwrap();
    let dest_root = temp_dir.path();

    let context = create_download_context(&base_url);
    let plan = make_plan(download_url, "tampered.epub");

    let expected_publication = epub_payload();
    let verifier = PinnedSha256 {
        expected_digest: sha256_hex(&expected_publication),
    };

    let result = download_file_with_verifier(&plan, &context, dest_root, None, &verifier).await;

    match &result {
        Err(DownloadError::HashMismatch(algorithm, computed)) => {
            assert_eq!(algorithm, "sha256");
            assert_eq!(
                computed,
                &sha256_hex(&served_bytes),
                "error must carry the digest of what was actually received"
            );
        }
        other => panic!("expected HashMismatch, got {:?}", other),
    }

    assert!(
        !dest_root.join("tampered.epub").exists(),
        "failed verification must not produce the destination file"
    );
    assert!(
        part_files_under(dest_root).is_empty(),
        "staged .part file must be removed after failed verification"
    );
}
