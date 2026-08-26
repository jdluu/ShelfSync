use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio_util::sync::CancellationToken;

use crate::opds::acquisition::{plan_download_destination, DownloadPlan, MEDIA_TYPE_EPUB};
use crate::opds::downloader::{
    check_content_type, make_unique_part_path, send_download_request, stream_to_file,
    DownloadContext, ProgressCallback,
};
use crate::opds::errors::{AcquisitionError, DownloadError};
use crate::opds::verify::{ContentVerifier, Sha256Verifier};
use crate::opds::Publication;
use crate::persist::{
    AcquisitionInput, CatalogAccount, JobState, LibraryStore, PersistError, PublicationInput,
    RevisionInput, StoredAcquisition, StoredDownloadJob, StoredFileRevision, StoredPublication,
};

mod archive_validator;
mod file_installer;
mod path_planner;

pub use crate::opds::verify::sha256_file;
pub use archive_validator::validate_epub_zip;
pub use file_installer::safe_remove_within_root;
pub use path_planner::safe_join;

pub const DEFAULT_MAX_ATTEMPTS: u32 = 3;
const RETRY_BACKOFF: Duration = Duration::from_millis(250);

#[derive(Debug, thiserror::Error)]
pub enum InstallError {
    #[error("no EPUB acquisition advertised for this publication")]
    NoEpub,
    #[error("acquisition planning failed: {0}")]
    Plan(#[from] AcquisitionError),
    #[error("download verification failed: {0}")]
    Download(#[from] DownloadError),
    #[error("persistence failed: {0}")]
    Persist(#[from] PersistError),
}

#[derive(Debug, Clone)]
pub struct VerifiedEpubRequest {
    pub provider: String,
    pub username: String,
    pub expected_length: Option<i64>,
    pub expected_hash: Option<String>,
    pub hash_algorithm: Option<String>,
}

#[derive(Debug)]
pub struct InstalledDownload {
    pub account: CatalogAccount,
    pub publication: StoredPublication,
    pub acquisition: StoredAcquisition,
    pub revision: StoredFileRevision,
    pub job: StoredDownloadJob,
    pub final_path: PathBuf,
    pub relative_path: String,
    pub bytes_received: u64,
    pub computed_hash_hex: Option<String>,
}

struct InstallFailure {
    error: InstallError,
    cancelled: bool,
}

impl From<DownloadError> for InstallFailure {
    fn from(error: DownloadError) -> Self {
        InstallFailure {
            cancelled: matches!(error, DownloadError::Cancelled),
            error: error.into(),
        }
    }
}

impl From<InstallError> for InstallFailure {
    fn from(error: InstallError) -> Self {
        InstallFailure {
            cancelled: false,
            error,
        }
    }
}

pub async fn download_verified_epub(
    context: &DownloadContext,
    store: &LibraryStore,
    content_root: &Path,
    publication: &Publication,
    request: VerifiedEpubRequest,
    progress_callback: Option<ProgressCallback>,
    cancellation: Option<CancellationToken>,
) -> Result<InstalledDownload, InstallError> {
    let plan = plan_download_destination(
        content_root,
        publication,
        &context.config.origin(),
        &context.config.url,
    )?;
    if plan.media_type != MEDIA_TYPE_EPUB {
        return Err(InstallError::NoEpub);
    }
    let dest_path = safe_join(content_root, &plan.destination)?;

    let account = store
        .ensure_catalog_account(
            request.provider.clone(),
            context.config.base_url(),
            request.username.clone(),
        )
        .await?;
    let metadata_json = serde_json::to_string(publication)
        .map_err(|e| PersistError::InvalidMetadata(e.to_string()))?;
    let upsert = store
        .upsert_publication(PublicationInput {
            account_id: account.id,
            provider: request.provider.clone(),
            canonical_id: publication.id.clone(),
            metadata_json,
        })
        .await?;
    let acq_upsert = store
        .upsert_acquisition(AcquisitionInput {
            publication_id: upsert.publication.id,
            media_type: plan.media_type.clone(),
            canonical_url: plan.url.as_str().to_string(),
        })
        .await?;
    let revision = store
        .create_file_revision(RevisionInput {
            acquisition_id: acq_upsert.acquisition.id,
            expected_length: request.expected_length,
            expected_hash: request.expected_hash.clone(),
            hash_algorithm: request.hash_algorithm.clone(),
            local_relative_path: None,
        })
        .await?;
    let job = store.create_download_job(revision.id).await?;
    store.set_job_state(job.id, JobState::Running, None).await?;

    match perform_install(
        context,
        &dest_path,
        &plan,
        &request,
        &progress_callback,
        cancellation,
    )
    .await
    {
        Ok(outcome) => {
            let relative_path = plan.destination.to_string_lossy().to_string();
            let completed_job = match store
                .complete_download(revision.id, relative_path.clone(), job.id)
                .await
            {
                Ok(job) => job,
                Err(e) => {
                    let _ = store
                        .set_job_state(job.id, JobState::Failed, Some(e.to_string()))
                        .await;
                    return Err(InstallError::from(e));
                }
            };
            let mut revision = revision;
            revision.local_relative_path = Some(relative_path.clone());
            Ok(InstalledDownload {
                account,
                publication: upsert.publication,
                acquisition: acq_upsert.acquisition,
                revision,
                job: completed_job,
                final_path: dest_path,
                relative_path,
                bytes_received: outcome.bytes_received,
                computed_hash_hex: outcome.computed_hash_hex,
            })
        }
        Err(failure) => {
            let state = if failure.cancelled {
                JobState::Cancelled
            } else {
                JobState::Failed
            };
            let _ = store
                .set_job_state(job.id, state, Some(failure.error.to_string()))
                .await;
            Err(failure.error)
        }
    }
}

struct InstallOutcome {
    bytes_received: u64,
    computed_hash_hex: Option<String>,
}

async fn perform_install(
    context: &DownloadContext,
    dest_path: &Path,
    plan: &DownloadPlan,
    request: &VerifiedEpubRequest,
    progress_callback: &Option<ProgressCallback>,
    cancellation: Option<CancellationToken>,
) -> Result<InstallOutcome, InstallFailure> {
    let mut part_path: Option<PathBuf> = None;

    let result: Result<InstallOutcome, InstallFailure> = async {
        let received = download_with_retries(
            context,
            dest_path,
            plan,
            progress_callback,
            cancellation.as_ref(),
            &mut part_path,
        )
        .await?;

        let part = part_path
            .as_ref()
            .ok_or_else(|| DownloadError::InvalidDestination("part path missing".to_string()))?;

        verify_lengths(received, request)?;
        let verifier = Sha256Verifier;
        let computed_hash_hex = verify_hash(&verifier, part, request)?;
        validate_epub_zip(part)?;

        file_installer::promote_verified_part(part, dest_path)?;
        part_path = None;

        Ok(InstallOutcome {
            bytes_received: received,
            computed_hash_hex,
        })
    }
    .await;

    if let Some(part) = part_path {
        let _ = std::fs::remove_file(&part);
    }

    result
}

async fn download_with_retries(
    context: &DownloadContext,
    dest_path: &Path,
    plan: &DownloadPlan,
    progress_callback: &Option<ProgressCallback>,
    cancellation: Option<&CancellationToken>,
    part_slot: &mut Option<PathBuf>,
) -> Result<u64, DownloadError> {
    let max_attempts = DEFAULT_MAX_ATTEMPTS.max(1);
    let mut attempt: u32 = 0;

    loop {
        attempt += 1;
        if let Some(token) = cancellation {
            if token.is_cancelled() {
                return Err(DownloadError::Cancelled);
            }
        }

        let streamed =
            stream_single_attempt(context, dest_path, plan, progress_callback, part_slot);
        let outcome = match cancellation {
            Some(token) => {
                tokio::select! {
                    biased;
                    _ = token.cancelled() => Err(DownloadError::Cancelled),
                    result = streamed => result,
                }
            }
            None => streamed.await,
        };

        match outcome {
            Ok(received) => return Ok(received),
            Err(err) if err.is_retryable() && attempt < max_attempts => {
                let _ = progress_callback.as_ref().map(|cb| cb(0, None));
                let backoff = RETRY_BACKOFF * attempt;
                match cancellation {
                    Some(token) => {
                        tokio::select! {
                            biased;
                            _ = token.cancelled() => return Err(DownloadError::Cancelled),
                            _ = tokio::time::sleep(backoff) => {}
                        }
                    }
                    None => tokio::time::sleep(backoff).await,
                }
            }
            Err(err) => return Err(err),
        }
    }
}

async fn stream_single_attempt(
    context: &DownloadContext,
    dest_path: &Path,
    plan: &DownloadPlan,
    progress_callback: &Option<ProgressCallback>,
    part_slot: &mut Option<PathBuf>,
) -> Result<u64, DownloadError> {
    let response = send_download_request(plan, context).await?;
    check_content_type(plan, &response)?;
    let total_bytes = response.content_length();

    if let Some(parent) = dest_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let part_path = make_unique_part_path(dest_path);
    *part_slot = Some(part_path.clone());

    match stream_to_file(
        response,
        &part_path,
        context.max_size,
        progress_callback,
        total_bytes,
    )
    .await
    {
        Ok(received) => {
            if let Some(header_length) = total_bytes {
                if header_length != received {
                    let _ = std::fs::remove_file(&part_path);
                    *part_slot = None;
                    return Err(DownloadError::LengthMismatch(header_length, received));
                }
            }
            Ok(received)
        }
        Err(err) => {
            let _ = std::fs::remove_file(&part_path);
            *part_slot = None;
            Err(err)
        }
    }
}

fn verify_lengths(received: u64, request: &VerifiedEpubRequest) -> Result<(), DownloadError> {
    if let Some(expected) = request.expected_length {
        if expected < 0 || expected as u64 != received {
            return Err(DownloadError::LengthMismatch(
                expected.max(0) as u64,
                received,
            ));
        }
    }
    Ok(())
}

fn verify_hash<V: ContentVerifier>(
    verifier: &V,
    part_path: &Path,
    request: &VerifiedEpubRequest,
) -> Result<Option<String>, DownloadError> {
    let Some(expected) = request.expected_hash.as_deref() else {
        return Ok(None);
    };
    let algorithm = request
        .hash_algorithm
        .clone()
        .unwrap_or_else(|| "sha256".to_string());
    if !algorithm.eq_ignore_ascii_case("sha256") {
        return Err(DownloadError::Transport(format!(
            "unsupported hash algorithm: {algorithm}"
        )));
    }
    verifier.verify(part_path, Some(expected))?;
    let computed = sha256_file(part_path)?;
    Ok(Some(computed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::opds::transport::CatalogConfig;
    use crate::opds::{Acquisition, Publication};
    use axum::body::Body;
    use axum::http::StatusCode;
    use axum::routing::get;
    use axum::Router;
    use axum_test::TestServer;
    use sha2::{Digest, Sha256};
    use std::collections::HashMap;
    use std::io::{Cursor, Write};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use tempfile::{tempdir, TempDir};
    use url::Url;

    const DOWNLOAD_PATH: &str = "/download/test_book.epub";

    fn sha256_hex(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        hasher
            .finalize()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }

    fn make_epub_bytes() -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        writer.start_file("mimetype", options).unwrap();
        writer.write_all(b"application/epub+zip").unwrap();
        writer.start_file("OEBPS/content.xhtml", options).unwrap();
        writer.write_all(b"<html><body>hi</body></html>").unwrap();
        writer.finish().unwrap().into_inner()
    }

    fn make_publication() -> Publication {
        Publication {
            id: "book-42".to_string(),
            updated: None,
            title: "Test Book".to_string(),
            authors: vec![],
            pubdate: None,
            publisher: None,
            categories: Vec::new(),
            identifiers: HashMap::new(),
            series: None,
            languages: vec![],
            relations: vec![],
            descriptions: vec![],
            links: vec![Acquisition {
                href: DOWNLOAD_PATH.to_string(),
                r#type: Some(MEDIA_TYPE_EPUB.to_string()),
                media_type: Some(MEDIA_TYPE_EPUB.to_string()),
                cost: None,
                rel: Some("acquisition".to_string()),
            }],
            providers: None,
            representative: None,
        }
    }

    struct TestEnv {
        _dir: TempDir,
        store: LibraryStore,
        content_root: PathBuf,
    }

    async fn setup_env() -> TestEnv {
        let dir = tempdir().unwrap();
        let store = LibraryStore::open(dir.path().join("client.db"))
            .await
            .unwrap();
        let content_root = dir.path().join("content");
        std::fs::create_dir_all(&content_root).unwrap();
        TestEnv {
            _dir: dir,
            store,
            content_root,
        }
    }

    fn make_context(base_url: &str) -> DownloadContext {
        let config = CatalogConfig::new(
            "grimmory",
            Url::parse(base_url).unwrap(),
            "testuser",
            "testpass".to_string(),
        )
        .unwrap();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .use_rustls_tls()
            .build()
            .unwrap();
        DownloadContext::new(client, config)
    }

    fn base_origin(server_url: &Url) -> String {
        format!(
            "{}://{}:{}",
            server_url.scheme(),
            server_url.host_str().unwrap_or(""),
            server_url.port().unwrap_or(80)
        )
    }

    fn request_for(payload: &[u8]) -> VerifiedEpubRequest {
        VerifiedEpubRequest {
            provider: "grimmory".to_string(),
            username: "testuser".to_string(),
            expected_length: Some(payload.len() as i64),
            expected_hash: Some(sha256_hex(payload)),
            hash_algorithm: Some("sha256".to_string()),
        }
    }

    fn no_part_files_left(root: &Path) -> bool {
        root.read_dir()
            .unwrap()
            .filter_map(|e| e.ok())
            .all(|e| !e.file_name().to_string_lossy().contains(".part"))
    }

    #[tokio::test]
    async fn success_path_installs_and_persists_verified_epub() {
        let epub = make_epub_bytes();
        let route_body = epub.clone();
        let app = Router::new().route(
            DOWNLOAD_PATH,
            get(move || {
                let body = route_body.clone();
                async move {
                    (
                        StatusCode::OK,
                        [("content-type", MEDIA_TYPE_EPUB)],
                        Body::from(body),
                    )
                }
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url(DOWNLOAD_PATH).unwrap();
        let origin = base_origin(&download_url);

        let env = setup_env().await;
        let context = make_context(&origin);
        let publication = make_publication();

        let progress_log: Arc<Mutex<Vec<(u64, Option<u64>)>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = progress_log.clone();
        let progress_callback: Option<ProgressCallback> = Some(Box::new(move |received, total| {
            sink.lock().unwrap().push((received, total));
        }));

        let result = download_verified_epub(
            &context,
            &env.store,
            &env.content_root,
            &publication,
            request_for(&epub),
            progress_callback,
            None,
        )
        .await
        .expect("verified download should succeed");

        assert_eq!(result.bytes_received, epub.len() as u64);
        assert_eq!(
            result.computed_hash_hex.as_deref(),
            Some(sha256_hex(&epub).as_str())
        );
        assert_eq!(result.job.state, JobState::Completed);
        assert_eq!(
            result.revision.local_relative_path.as_deref(),
            Some(result.relative_path.as_str())
        );
        assert_eq!(result.account.username, "testuser");

        let final_path = env.content_root.join("Test_Book.epub");
        assert_eq!(result.final_path.file_name().unwrap(), "Test_Book.epub");
        assert_eq!(
            std::fs::read(&result.final_path).unwrap(),
            epub,
            "final file must contain verified bytes"
        );
        let canonical_root = std::fs::canonicalize(&env.content_root).unwrap();
        assert!(result.final_path.starts_with(&canonical_root));
        assert_eq!(std::fs::read(&final_path).unwrap(), epub);
        assert!(no_part_files_left(&env.content_root));

        let log = progress_log.lock().unwrap();
        assert!(!log.is_empty(), "progress events should be emitted");
        let last = *log.last().unwrap();
        assert_eq!(last.0, epub.len() as u64);
        drop(log);

        let stored_pub = env
            .store
            .find_publication(
                result.account.id,
                "grimmory".to_string(),
                "book-42".to_string(),
            )
            .await
            .unwrap()
            .expect("publication row should exist");
        let acquisitions = env.store.list_acquisitions(stored_pub.id).await.unwrap();
        assert_eq!(acquisitions.len(), 1);
        assert_eq!(acquisitions[0].media_type, MEDIA_TYPE_EPUB);

        let revision = env
            .store
            .current_revision(acquisitions[0].id)
            .await
            .unwrap()
            .expect("revision should exist");
        assert_eq!(revision.id, result.revision.id);
        assert!(revision.local_relative_path.is_some());

        let job = env.store.get_job(result.job.id).await.unwrap().unwrap();
        assert_eq!(job.state, JobState::Completed);
    }

    #[tokio::test]
    async fn hash_mismatch_leaves_no_complete_record() {
        let epub = make_epub_bytes();
        let route_body = epub.clone();
        let app = Router::new().route(
            DOWNLOAD_PATH,
            get(move || {
                let body = route_body.clone();
                async move { (StatusCode::OK, Body::from(body)) }
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let origin = base_origin(&server.server_url(DOWNLOAD_PATH).unwrap());

        let env = setup_env().await;
        let context = make_context(&origin);

        let mut request = request_for(&epub);
        request.expected_hash = Some(sha256_hex(b"definitely not the payload"));

        let err = download_verified_epub(
            &context,
            &env.store,
            &env.content_root,
            &make_publication(),
            request,
            None,
            None,
        )
        .await
        .err()
        .expect("hash mismatch must fail");

        assert!(
            matches!(
                err,
                InstallError::Download(DownloadError::HashMismatch(_, _))
            ),
            "unexpected error: {err:?}"
        );

        assert!(!env.content_root.join("Test_Book.epub").exists());
        assert!(no_part_files_left(&env.content_root));

        let pub_row = env
            .store
            .find_publication(1, "grimmory".to_string(), "book-42".to_string())
            .await
            .unwrap()
            .expect("publication record may exist for retry");
        let acquisitions = env.store.list_acquisitions(pub_row.id).await.unwrap();
        let revision = env
            .store
            .current_revision(acquisitions[0].id)
            .await
            .unwrap()
            .unwrap();
        assert!(
            revision.local_relative_path.is_none(),
            "revision must not claim a local file"
        );
        let jobs = env.store.jobs_for_revision(revision.id).await.unwrap();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].state, JobState::Failed);
        assert!(jobs[0].error.as_deref().unwrap_or("").contains("mismatch"));
    }

    #[tokio::test]
    async fn invalid_zip_fails_without_completing() {
        let garbage: Vec<u8> = b"this is not a zip archive at all".to_vec();
        let route_body = garbage.clone();
        let app = Router::new().route(
            DOWNLOAD_PATH,
            get(move || {
                let body = route_body.clone();
                async move {
                    (
                        StatusCode::OK,
                        [("content-type", MEDIA_TYPE_EPUB)],
                        Body::from(body),
                    )
                }
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let origin = base_origin(&server.server_url(DOWNLOAD_PATH).unwrap());

        let env = setup_env().await;
        let context = make_context(&origin);

        let err = download_verified_epub(
            &context,
            &env.store,
            &env.content_root,
            &make_publication(),
            request_for(&garbage),
            None,
            None,
        )
        .await
        .err()
        .expect("invalid zip must fail");

        assert!(matches!(
            err,
            InstallError::Download(DownloadError::InvalidZip(_))
        ));

        assert!(!env.content_root.join("Test_Book.epub").exists());
        assert!(no_part_files_left(&env.content_root));

        let pub_row = env
            .store
            .find_publication(1, "grimmory".to_string(), "book-42".to_string())
            .await
            .unwrap()
            .unwrap();
        let acquisitions = env.store.list_acquisitions(pub_row.id).await.unwrap();
        let revision = env
            .store
            .current_revision(acquisitions[0].id)
            .await
            .unwrap()
            .unwrap();
        assert!(revision.local_relative_path.is_none());
        let jobs = env.store.jobs_for_revision(revision.id).await.unwrap();
        assert_eq!(jobs[0].state, JobState::Failed);
    }

    #[tokio::test]
    async fn auth_failure_marks_job_failed_and_downloads_nothing() {
        let app = Router::new().route(
            DOWNLOAD_PATH,
            get(|| async { (StatusCode::UNAUTHORIZED, Body::from("denied")) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let origin = base_origin(&server.server_url(DOWNLOAD_PATH).unwrap());

        let env = setup_env().await;
        let context = make_context(&origin);
        let payload = make_epub_bytes();

        let err = download_verified_epub(
            &context,
            &env.store,
            &env.content_root,
            &make_publication(),
            request_for(&payload),
            None,
            None,
        )
        .await
        .err()
        .expect("auth failure must fail");

        assert!(matches!(
            err,
            InstallError::Download(DownloadError::AuthFailed)
        ));
        assert!(!env.content_root.join("Test_Book.epub").exists());
        assert!(no_part_files_left(&env.content_root));

        let pub_row = env
            .store
            .find_publication(1, "grimmory".to_string(), "book-42".to_string())
            .await
            .unwrap()
            .unwrap();
        let acquisitions = env.store.list_acquisitions(pub_row.id).await.unwrap();
        let revision = env
            .store
            .current_revision(acquisitions[0].id)
            .await
            .unwrap()
            .unwrap();
        assert!(revision.local_relative_path.is_none());
        let jobs = env.store.jobs_for_revision(revision.id).await.unwrap();
        assert_eq!(jobs[0].state, JobState::Failed);
    }

    #[tokio::test]
    async fn length_mismatch_fails_cleanly() {
        let epub = make_epub_bytes();
        let route_body = epub.clone();
        let app = Router::new().route(
            DOWNLOAD_PATH,
            get(move || {
                let body = route_body.clone();
                async move { (StatusCode::OK, Body::from(body)) }
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let origin = base_origin(&server.server_url(DOWNLOAD_PATH).unwrap());

        let env = setup_env().await;
        let context = make_context(&origin);

        let mut request = request_for(&epub);
        request.expected_length = Some(epub.len() as i64 + 1);

        let err = download_verified_epub(
            &context,
            &env.store,
            &env.content_root,
            &make_publication(),
            request,
            None,
            None,
        )
        .await
        .err()
        .unwrap();

        assert!(matches!(
            err,
            InstallError::Download(DownloadError::LengthMismatch(_, _))
        ));
        assert!(!env.content_root.join("Test_Book.epub").exists());
        assert!(no_part_files_left(&env.content_root));
    }

    #[tokio::test]
    async fn replacement_failure_keeps_old_verified_file_intact() {
        let garbage: Vec<u8> = b"not an epub".to_vec();
        let route_body = garbage.clone();
        let app = Router::new().route(
            DOWNLOAD_PATH,
            get(move || {
                let body = route_body.clone();
                async move {
                    (
                        StatusCode::OK,
                        [("content-type", MEDIA_TYPE_EPUB)],
                        Body::from(body),
                    )
                }
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let origin = base_origin(&server.server_url(DOWNLOAD_PATH).unwrap());

        let env = setup_env().await;
        let old_path = env.content_root.join("Test_Book.epub");
        std::fs::write(&old_path, b"old verified content").unwrap();

        let context = make_context(&origin);
        let err = download_verified_epub(
            &context,
            &env.store,
            &env.content_root,
            &make_publication(),
            request_for(&garbage),
            None,
            None,
        )
        .await
        .err()
        .unwrap();

        assert!(matches!(
            err,
            InstallError::Download(DownloadError::InvalidZip(_))
        ));
        assert_eq!(
            std::fs::read(&old_path).unwrap(),
            b"old verified content",
            "old verified file must stay intact"
        );
        assert!(no_part_files_left(&env.content_root));
    }

    #[tokio::test]
    async fn retries_server_errors_then_succeeds() {
        let epub = make_epub_bytes();
        let route_body = epub.clone();
        let hits = Arc::new(AtomicUsize::new(0));
        let route_hits = hits.clone();
        let app = Router::new().route(
            DOWNLOAD_PATH,
            get(move || {
                let hits = route_hits.clone();
                let body = route_body.clone();
                async move {
                    let n = hits.fetch_add(1, Ordering::SeqCst);
                    if n < 2 {
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            [("content-type", "text/plain")],
                            Body::from("boom"),
                        )
                    } else {
                        (
                            StatusCode::OK,
                            [("content-type", MEDIA_TYPE_EPUB)],
                            Body::from(body),
                        )
                    }
                }
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let origin = base_origin(&server.server_url(DOWNLOAD_PATH).unwrap());

        let env = setup_env().await;
        let context = make_context(&origin);

        let result = download_verified_epub(
            &context,
            &env.store,
            &env.content_root,
            &make_publication(),
            request_for(&epub),
            None,
            None,
        )
        .await
        .expect("retryable failures should be retried");

        assert_eq!(hits.load(Ordering::SeqCst), 3);
        assert_eq!(result.job.state, JobState::Completed);
        assert_eq!(
            std::fs::read(env.content_root.join("Test_Book.epub")).unwrap(),
            epub
        );
        assert!(no_part_files_left(&env.content_root));
    }

    #[tokio::test]
    async fn cancellation_marks_job_cancelled() {
        let epub = make_epub_bytes();
        let route_body = epub.clone();
        let app = Router::new().route(
            DOWNLOAD_PATH,
            get(move || {
                let body = route_body.clone();
                async move {
                    (
                        StatusCode::OK,
                        [("content-type", MEDIA_TYPE_EPUB)],
                        Body::from(body),
                    )
                }
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let origin = base_origin(&server.server_url(DOWNLOAD_PATH).unwrap());

        let env = setup_env().await;
        let context = make_context(&origin);

        let token = CancellationToken::new();
        token.cancel();

        let err = download_verified_epub(
            &context,
            &env.store,
            &env.content_root,
            &make_publication(),
            request_for(&epub),
            None,
            Some(token),
        )
        .await
        .err()
        .unwrap();

        assert!(matches!(
            err,
            InstallError::Download(DownloadError::Cancelled)
        ));
        assert!(!env.content_root.join("Test_Book.epub").exists());
        assert!(no_part_files_left(&env.content_root));

        let pub_row = env
            .store
            .find_publication(1, "grimmory".to_string(), "book-42".to_string())
            .await
            .unwrap()
            .unwrap();
        let acquisitions = env.store.list_acquisitions(pub_row.id).await.unwrap();
        let revision = env
            .store
            .current_revision(acquisitions[0].id)
            .await
            .unwrap()
            .unwrap();
        assert!(revision.local_relative_path.is_none());
        let jobs = env.store.jobs_for_revision(revision.id).await.unwrap();
        assert_eq!(jobs[0].state, JobState::Cancelled);
    }

    #[tokio::test]
    async fn non_epub_plan_is_rejected_before_any_records() {
        let env = setup_env().await;

        let mut publication = make_publication();
        publication.links.clear();
        publication.links.push(Acquisition {
            href: DOWNLOAD_PATH.to_string(),
            r#type: Some(crate::opds::MEDIA_TYPE_PDF.to_string()),
            media_type: Some(crate::opds::MEDIA_TYPE_PDF.to_string()),
            cost: None,
            rel: Some("acquisition".to_string()),
        });

        let context = make_context("https://books.example.com/opds");
        let payload = b"pdf bytes".to_vec();
        let mut request = request_for(&payload);
        request.expected_hash = None;
        request.hash_algorithm = None;

        let err = download_verified_epub(
            &context,
            &env.store,
            &env.content_root,
            &publication,
            request,
            None,
            None,
        )
        .await
        .err()
        .unwrap();

        assert!(matches!(err, InstallError::NoEpub));

        assert!(env.store.active_jobs().await.unwrap().is_empty());
        let pubs = env
            .store
            .find_publication(1, "grimmory".to_string(), "book-42".to_string())
            .await
            .unwrap();
        assert!(
            pubs.is_none(),
            "no records should be written before planning passes"
        );
    }
}
