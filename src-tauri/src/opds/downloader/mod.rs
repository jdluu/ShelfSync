use crate::opds::errors::DownloadError;
use crate::opds::transport::{origin_matches, CatalogConfig};
use crate::opds::verify::{ContentVerifier, Sha256Verifier};
use crate::opds::DownloadPlan;
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

mod progress;
mod verify;

pub use progress::ProgressCallback;

pub const DEFAULT_DOWNLOAD_TIMEOUT_SECS: u64 = 30;
pub const DEFAULT_MAX_DOWNLOAD_SIZE: u64 = 50 * 1024 * 1024;

pub struct DownloadContext {
    pub client: reqwest::Client,
    pub config: CatalogConfig,
    pub max_size: u64,
}

impl Default for DownloadContext {
    fn default() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(DEFAULT_DOWNLOAD_TIMEOUT_SECS))
                .redirect(reqwest::redirect::Policy::none())
                .use_rustls_tls()
                .build()
                .expect("Failed to build default HTTP client"),
            config: CatalogConfig::new(
                "default",
                url::Url::parse("https://example.com").unwrap(),
                "user",
                "pass".to_string(),
            )
            .unwrap(),
            max_size: DEFAULT_MAX_DOWNLOAD_SIZE,
        }
    }
}

impl DownloadContext {
    pub fn new(client: reqwest::Client, config: CatalogConfig) -> Self {
        Self {
            client,
            config,
            max_size: DEFAULT_MAX_DOWNLOAD_SIZE,
        }
    }

    pub fn with_max_size(mut self, max_size: u64) -> Self {
        self.max_size = max_size;
        self
    }

    fn build_headers(&self, url: &url::Url) -> HeaderMap {
        let mut headers = HeaderMap::new();

        if origin_matches(url, &self.config.origin()) {
            use base64::Engine;
            let credentials = format!("{}:{}", self.config.username, self.config.password);
            let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Basic {}", encoded)).unwrap(),
            );
        }

        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/xml"));
        headers
    }

    pub(crate) fn request_headers(&self, url: &url::Url) -> HeaderMap {
        self.build_headers(url)
    }
}

pub(crate) async fn send_download_request(
    plan: &DownloadPlan,
    context: &DownloadContext,
) -> Result<reqwest::Response, DownloadError> {
    let url = &plan.url;

    if url.username().is_empty() && url.password().is_some() {
        return Err(DownloadError::Transport(
            "Credentials in URL not allowed".to_string(),
        ));
    }

    if !origin_matches(url, &context.config.origin()) {
        return Err(DownloadError::Transport(
            "Download URL origin does not match catalog origin".to_string(),
        ));
    }

    let headers = context.request_headers(url);

    let response = context
        .client
        .get(url.clone())
        .headers(headers)
        .timeout(Duration::from_secs(DEFAULT_DOWNLOAD_TIMEOUT_SECS))
        .send()
        .await
        .map_err(|e| DownloadError::Network(e.to_string()))?;

    classify_status(response)
}

fn classify_status(response: reqwest::Response) -> Result<reqwest::Response, DownloadError> {
    match response.status() {
        status if status.is_success() => Ok(response),
        reqwest::StatusCode::UNAUTHORIZED => Err(DownloadError::AuthFailed),
        reqwest::StatusCode::FORBIDDEN => Err(DownloadError::Forbidden),
        reqwest::StatusCode::NOT_FOUND => Err(DownloadError::NotFound),
        reqwest::StatusCode::TOO_MANY_REQUESTS => Err(DownloadError::RateLimited),
        status if status.is_server_error() => Err(DownloadError::Server(status.as_u16())),
        status => Err(DownloadError::Transport(format!(
            "HTTP status error: {}",
            status
        ))),
    }
}

pub(crate) fn check_content_type(
    plan: &DownloadPlan,
    response: &reqwest::Response,
) -> Result<(), DownloadError> {
    if let Some(content_type) = response.headers().get(CONTENT_TYPE) {
        let ct_str = content_type.to_str().unwrap_or("");
        if !is_accepted_content_type(ct_str, &plan.media_type) {
            return Err(DownloadError::ContentTypeMismatch(
                plan.media_type.clone(),
                ct_str.to_string(),
            ));
        }
    }
    Ok(())
}

pub async fn download_file(
    plan: &DownloadPlan,
    context: &DownloadContext,
    dest_root: &Path,
    progress_callback: Option<ProgressCallback>,
) -> Result<PathBuf, DownloadError> {
    download_file_with_verifier(plan, context, dest_root, progress_callback, &Sha256Verifier).await
}

pub async fn download_file_with_verifier<V: ContentVerifier>(
    plan: &DownloadPlan,
    context: &DownloadContext,
    dest_root: &Path,
    progress_callback: Option<ProgressCallback>,
    verifier: &V,
) -> Result<PathBuf, DownloadError> {
    let response = send_download_request(plan, context).await?;

    check_content_type(plan, &response)?;

    let total_bytes = response.content_length();

    let dest_path = validate_and_join_path(dest_root, &plan.destination)?;

    let parent = dest_path.parent().ok_or_else(|| {
        DownloadError::InvalidDestination("Failed to get parent directory".to_string())
    })?;

    if !parent.exists() {
        std::fs::create_dir_all(&parent).map_err(|e| {
            DownloadError::InvalidDestination(format!("Failed to create parent directory: {}", e))
        })?;
    }

    let part_path = make_unique_part_path(&dest_path);

    let pre_existing = dest_path.exists();
    let original_content: Option<Vec<u8>> = if pre_existing {
        std::fs::read(&dest_path).ok()
    } else {
        None
    };

    if part_path.exists() {
        let _ = std::fs::remove_file(&part_path);
    }

    let result = stream_to_file(
        response,
        &part_path,
        context.max_size,
        &progress_callback,
        total_bytes,
    )
    .await;

    match result {
        Ok(_) => {
            if let Err(e) = verify::ensure_verified(&part_path, None, verifier) {
                let _ = std::fs::remove_file(&part_path);
                return Err(e);
            }
            std::fs::rename(&part_path, &dest_path)
                .map_err(|e| {
                    let _ = std::fs::remove_file(&part_path);
                    DownloadError::InvalidDestination(e.to_string())
                })
                .map(|_| dest_path)
        }
        Err(e) => {
            let _ = std::fs::remove_file(&part_path);
            if !pre_existing {
                return Err(e);
            }
            if let Some(original) = original_content {
                let _ = std::fs::write(&dest_path, original);
            }
            Err(e)
        }
    }
}

pub(crate) fn make_unique_part_path(dest_path: &Path) -> PathBuf {
    let temp_suffix = Uuid::new_v4().to_string();
    dest_path.with_extension(
        format!(
            "{}.part-{}",
            dest_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("file"),
            temp_suffix
        )
        .as_str(),
    )
}

fn is_accepted_content_type(received: &str, expected: &str) -> bool {
    let received_clean = received.split(';').next().unwrap_or(received).trim();
    let expected_clean = expected.trim();

    if expected_clean.is_empty() {
        return true;
    }

    received_clean.eq_ignore_ascii_case(expected_clean)
}

fn validate_and_join_path(root: &Path, dest: &Path) -> Result<PathBuf, DownloadError> {
    if dest.as_os_str().is_empty() {
        return Err(DownloadError::InvalidDestination(
            "Destination path is empty".to_string(),
        ));
    }

    let canonical_root = std::fs::canonicalize(root).map_err(|_| {
        DownloadError::InvalidDestination("Cannot canonicalize destination root".to_string())
    })?;

    let full_path = canonical_root.join(dest);

    if !full_path.starts_with(&canonical_root) {
        let _ = std::fs::canonicalize(&full_path).ok();
        return Err(DownloadError::InvalidDestination(
            "Destination path escapes root".to_string(),
        ));
    }

    for component in full_path.components() {
        if let std::path::Component::ParentDir = component {
            if !full_path.starts_with(&canonical_root) {
                return Err(DownloadError::InvalidDestination(
                    "Path contains parent directory traversal".to_string(),
                ));
            }
        }
    }

    Ok(full_path)
}

pub(crate) async fn stream_to_file(
    response: reqwest::Response,
    part_path: &Path,
    max_size: u64,
    progress_callback: &Option<ProgressCallback>,
    total_bytes: Option<u64>,
) -> Result<u64, DownloadError> {
    use tokio::io::AsyncWriteExt;

    let file = tokio::fs::File::create(part_path).await?;
    let mut writer = tokio::io::BufWriter::new(file);

    let mut received: u64 = 0;
    let mut stream = response.bytes_stream();

    progress::emit_progress(progress_callback, 0, total_bytes);

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| DownloadError::Network(e.to_string()))?;
        let chunk_len = chunk.len() as u64;

        if received.checked_add(chunk_len).is_none() || received + chunk_len > max_size {
            return Err(DownloadError::SizeExceeded(received + chunk_len, max_size));
        }

        received += chunk_len;

        writer.write_all(&chunk).await?;

        progress::emit_progress(progress_callback, received, total_bytes);
    }

    writer.flush().await?;
    drop(writer);

    if received == 0 {
        return Err(DownloadError::IncompleteDownload);
    }

    Ok(received)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::opds::transport::CatalogConfig;
    use crate::opds::MEDIA_TYPE_EPUB;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        middleware::{from_fn, Next},
        routing::get,
        Router,
    };
    use axum_test::TestServer;
    use tempfile::TempDir;
    use url::Url;

    fn create_download_context(base_url: &str, username: &str, password: &str) -> DownloadContext {
        let config = CatalogConfig::new(
            "test",
            Url::parse(base_url).unwrap(),
            username,
            password.to_string(),
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

    fn create_test_context(base_url: &str) -> DownloadContext {
        create_download_context(base_url, "testuser", "testpass")
    }

    fn make_test_plan(url: Url, dest_filename: &str, media_type: &str) -> DownloadPlan {
        DownloadPlan {
            url,
            destination: PathBuf::from(dest_filename),
            filename: dest_filename.to_string(),
            media_type: media_type.to_string(),
        }
    }

    fn base_url_from_server_url(server_url: &Url) -> String {
        format!(
            "{}://{}:{}",
            server_url.scheme(),
            server_url.host_str().unwrap_or(""),
            server_url.port().unwrap_or(80)
        )
    }

    #[tokio::test]
    async fn test_download_file_success() {
        let content = b"test ebook content";
        let app = Router::new().route(
            "/download/test.epub",
            get(|| async { (StatusCode::OK, Body::from(content.to_vec())) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url("/download/test.epub").unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let context = create_test_context(&base_url);

        let plan = make_test_plan(download_url, "test.epub", MEDIA_TYPE_EPUB);
        let dest_root = temp_dir.path();

        let result = download_file(&plan, &context, dest_root, None).await;

        assert!(result.is_ok());
        let downloaded = result.unwrap();
        assert!(downloaded.exists());
        assert_eq!(std::fs::read(downloaded).unwrap(), content);
    }

    #[tokio::test]
    async fn test_download_file_auth_header_sent() {
        let content = b"test content";
        let app = Router::new().route(
            "/download/test.epub",
            get(|| async { (StatusCode::OK, Body::from(content.to_vec())) }),
        );

        let app = app.layer(from_fn(|req: Request<Body>, next: Next| async move {
            let headers = req.headers();
            let auth_header = headers
                .get(axum::http::header::AUTHORIZATION)
                .map(|v| v.to_str().unwrap_or(""));

            let expected_auth = "Basic dGVzdHVzZXI6dGVzdHBhc3M=";
            assert_eq!(
                auth_header,
                Some(expected_auth),
                "Authorization header not sent correctly"
            );
            next.run(req).await
        }));

        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url("/download/test.epub").unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let context = create_download_context(&base_url, "testuser", "testpass");

        let plan = make_test_plan(download_url, "test.epub", MEDIA_TYPE_EPUB);
        let dest_root = temp_dir.path();

        let result = download_file(&plan, &context, dest_root, None).await;
        assert!(result.is_ok(), "Download should succeed with valid auth");
    }

    #[tokio::test]
    async fn test_download_file_status_failure() {
        let app = Router::new().route(
            "/download/test.epub",
            get(|| async { (StatusCode::FORBIDDEN, Body::from("access denied")) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url("/download/test.epub").unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let context = create_test_context(&base_url);

        let plan = make_test_plan(download_url, "test.epub", MEDIA_TYPE_EPUB);
        let dest_root = temp_dir.path();

        let result = download_file(&plan, &context, dest_root, None).await;
        assert!(matches!(result, Err(DownloadError::Forbidden)));
    }

    #[tokio::test]
    async fn test_download_file_oversized() {
        let large_content = vec![0u8; 1024 * 1024];
        let app = Router::new().route(
            "/download/test.epub",
            get(move || {
                let content = large_content.clone();
                async move { (StatusCode::OK, Body::from(content)) }
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url("/download/test.epub").unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let context = DownloadContext {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(DEFAULT_DOWNLOAD_TIMEOUT_SECS))
                .redirect(reqwest::redirect::Policy::none())
                .use_rustls_tls()
                .build()
                .unwrap(),
            config: CatalogConfig::new(
                "test",
                Url::parse(&base_url).unwrap(),
                "testuser",
                "testpass".to_string(),
            )
            .unwrap(),
            max_size: 1024,
        };

        let plan = make_test_plan(download_url, "test.epub", MEDIA_TYPE_EPUB);
        let dest_root = temp_dir.path();

        let result = download_file(&plan, &context, dest_root, None).await;
        assert!(matches!(result, Err(DownloadError::SizeExceeded(_, _))));
    }

    #[tokio::test]
    async fn test_download_file_content_type_mismatch() {
        let app = Router::new().route(
            "/download/test.epub",
            get(|| async {
                (
                    StatusCode::OK,
                    [("content-type", "text/html")],
                    Body::from("content"),
                )
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url("/download/test.epub").unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let context = create_test_context(&base_url);

        let plan = make_test_plan(download_url, "test.epub", MEDIA_TYPE_EPUB);
        let dest_root = temp_dir.path();

        let result = download_file(&plan, &context, dest_root, None).await;
        assert!(matches!(
            result,
            Err(DownloadError::ContentTypeMismatch(_, _))
        ));
    }

    #[tokio::test]
    async fn test_download_file_atomic_replacement() {
        let content = b"new ebook content";

        let app = Router::new().route(
            "/download/test.epub",
            get(move || async { (StatusCode::OK, Body::from(content.to_vec())) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url("/download/test.epub").unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let context = create_test_context(&base_url);

        let existing_path = temp_dir.path().join("test.epub");
        std::fs::write(&existing_path, "old content").unwrap();

        let plan = make_test_plan(download_url, "test.epub", MEDIA_TYPE_EPUB);
        let dest_root = temp_dir.path();

        let result = download_file(&plan, &context, dest_root, None).await;
        assert!(result.is_ok());

        let downloaded_content = std::fs::read(existing_path).unwrap();
        assert_eq!(downloaded_content, content);
    }

    #[tokio::test]
    async fn test_download_file_no_leftover_part_files_on_failure() {
        let app = Router::new().route(
            "/download/test.epub",
            get(|| async { (StatusCode::INTERNAL_SERVER_ERROR, Body::from("error")) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url("/download/test.epub").unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let context = create_test_context(&base_url);

        let plan = make_test_plan(download_url, "test.epub", MEDIA_TYPE_EPUB);
        let dest_root = temp_dir.path();

        let result = download_file(&plan, &context, dest_root, None).await;
        assert!(result.is_err());

        let part_files: Vec<_> = temp_dir
            .path()
            .read_dir()
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(".part"))
            .collect();
        assert!(part_files.is_empty(), "No .part files should remain");
    }

    #[tokio::test]
    async fn test_download_file_preserves_existing_on_failure() {
        let app = Router::new().route(
            "/download/test.epub",
            get(|| async { (StatusCode::INTERNAL_SERVER_ERROR, Body::from("error")) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url("/download/test.epub").unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let context = create_test_context(&base_url);

        let existing_path = temp_dir.path().join("test.epub");
        let existing_content = b"original content";
        std::fs::write(&existing_path, existing_content).unwrap();

        let plan = make_test_plan(download_url, "test.epub", MEDIA_TYPE_EPUB);
        let dest_root = temp_dir.path();

        let result = download_file(&plan, &context, dest_root, None).await;
        assert!(result.is_err());

        let current_content = std::fs::read(&existing_path).unwrap();
        assert_eq!(
            current_content, existing_content,
            "Existing file should be preserved"
        );
    }

    #[tokio::test]
    async fn test_download_file_interrupted_body() {
        use std::time::Duration as StdDuration;
        use tokio::time::sleep;

        let app = Router::new().route(
            "/download/test.epub",
            get(|| {
                let body = Body::from(b"chunk1".to_vec());
                async move {
                    sleep(StdDuration::from_millis(50)).await;
                    (StatusCode::OK, body)
                }
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url("/download/test.epub").unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let context = create_test_context(&base_url);

        let plan = make_test_plan(download_url, "test.epub", MEDIA_TYPE_EPUB);
        let dest_root = temp_dir.path();

        let result = download_file(&plan, &context, dest_root, None).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_is_accepted_content_type() {
        assert!(is_accepted_content_type(
            "application/epub+zip",
            "application/epub+zip"
        ));
        assert!(is_accepted_content_type(
            "application/epub+zip; charset=utf-8",
            "application/epub+zip"
        ));
        assert!(is_accepted_content_type(
            "application/pdf",
            "application/pdf"
        ));
        assert!(!is_accepted_content_type(
            "text/html",
            "application/epub+zip"
        ));
        assert!(is_accepted_content_type("text/html", ""));
    }

    #[test]
    fn test_validate_and_join_path() {
        let temp_dir = TempDir::new().unwrap();
        let root = temp_dir.path().to_path_buf();
        let canonical_root = std::fs::canonicalize(&root).unwrap();

        let dest = PathBuf::from("book.epub");
        let result = validate_and_join_path(&root, &dest);
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with(&canonical_root));
    }

    #[tokio::test]
    async fn test_download_file_from_plan_download_destination() {
        use crate::opds::acquisition::{plan_download_destination, MEDIA_TYPE_EPUB};
        use crate::opds::{Acquisition, Publication};
        use std::collections::HashMap;

        let content = b"test book content";
        let app = Router::new().route(
            "/download/The_Way_of_Kings.epub",
            get(|| async { (StatusCode::OK, Body::from(content.to_vec())) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server
            .server_url("/download/The_Way_of_Kings.epub")
            .unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let dest_root = temp_dir.path();

        let context = create_test_context(&base_url);

        let config = CatalogConfig::new(
            "test",
            Url::parse(&base_url).unwrap(),
            "testuser",
            "testpass".to_string(),
        )
        .unwrap();

        let acquisition = Acquisition {
            href: "/download/The_Way_of_Kings.epub".to_string(),
            r#type: Some(MEDIA_TYPE_EPUB.to_string()),
            media_type: Some(MEDIA_TYPE_EPUB.to_string()),
            cost: None,
            rel: Some("acquisition".to_string()),
        };
        let publ = Publication {
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
            links: vec![acquisition],
            providers: None,
            representative: None,
        };

        let plan =
            plan_download_destination(dest_root, &publ, &config.origin(), &config.url).unwrap();

        let result = download_file(&plan, &context, dest_root, None).await;
        assert!(result.is_ok(), "Download should succeed");

        let downloaded = result.unwrap();
        assert!(downloaded.exists());
        assert_eq!(std::fs::read(&downloaded).unwrap(), content);

        let expected_path = dest_root.join("Test_Book.epub");
        assert_eq!(
            downloaded, expected_path,
            "File should be exactly at dest_root/filename, not double-nested"
        );

        let parent = downloaded.parent().unwrap();
        assert!(parent == dest_root, "Parent should be dest_root exactly");

        let canonical_root = std::fs::canonicalize(dest_root).unwrap();
        let canonical_downloaded = std::fs::canonicalize(&downloaded).unwrap();
        assert!(
            canonical_downloaded.starts_with(&canonical_root),
            "Downloaded file should be under content root"
        );
    }

    #[tokio::test]
    async fn test_download_file_multidot_filename() {
        let content = b"test content for multi-dot file";
        let app = Router::new().route(
            "/download/test.file.name.with.dots.epub",
            get(|| async { (StatusCode::OK, Body::from(content.to_vec())) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server
            .server_url("/download/test.file.name.with.dots.epub")
            .unwrap();
        let base_url = base_url_from_server_url(&download_url);

        let temp_dir = TempDir::new().unwrap();
        let dest_root = temp_dir.path();

        let context = create_test_context(&base_url);

        let plan = DownloadPlan {
            url: download_url,
            destination: PathBuf::from("test.file.name.with.dots.epub"),
            filename: "test.file.name.with.dots.epub".to_string(),
            media_type: MEDIA_TYPE_EPUB.to_string(),
        };

        let result = download_file(&plan, &context, dest_root, None).await;
        assert!(
            result.is_ok(),
            "Download should succeed for multi-dot filename"
        );

        let downloaded = result.unwrap();
        assert!(downloaded.exists());
        assert_eq!(std::fs::read(&downloaded).unwrap(), content);
        assert!(
            downloaded
                .to_string_lossy()
                .ends_with("test.file.name.with.dots.epub"),
            "Part file suffix should be preserved correctly"
        );
    }

    #[tokio::test]
    async fn test_download_file_cross_origin_rejected() {
        let app = Router::new().route(
            "/download/test.epub",
            get(|| async { (StatusCode::OK, Body::from("content".as_bytes())) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let download_url = server.server_url("/download/test.epub").unwrap();

        let temp_dir = TempDir::new().unwrap();

        let evil_config = CatalogConfig::new(
            "evil",
            Url::parse("https://evil.com/opds").unwrap(),
            "user",
            "pass".to_string(),
        )
        .unwrap();

        let context = DownloadContext::new(
            reqwest::Client::builder()
                .timeout(Duration::from_secs(DEFAULT_DOWNLOAD_TIMEOUT_SECS))
                .redirect(reqwest::redirect::Policy::none())
                .use_rustls_tls()
                .build()
                .unwrap(),
            evil_config,
        );

        let plan = DownloadPlan {
            url: download_url,
            destination: PathBuf::from("test.epub"),
            filename: "test.epub".to_string(),
            media_type: MEDIA_TYPE_EPUB.to_string(),
        };

        let result = download_file(&plan, &context, temp_dir.path(), None).await;
        assert!(matches!(result, Err(DownloadError::Transport(_))));
    }
}
