use crate::error::AppError;
use crate::opds::{
    download_file, plan_download_destination, Catalog, CatalogConfig, ClientPagination,
    DownloadContext, DownloadError, OpdsClient, Publication,
};
use serde::Serialize;
use tauri::{command, AppHandle, Emitter};
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

fn sanitize_error_message(err: &DownloadError) -> String {
    match err {
        DownloadError::Transport(msg) => {
            if msg.contains("credentials")
                || msg.contains("auth")
                || msg.contains("password")
                || msg.contains("user")
            {
                "Authentication failed".to_string()
            } else if msg.contains("origin") || msg.contains("cross") || msg.contains("redirect") {
                "Cross-origin download rejected".to_string()
            } else if msg.contains("status") || msg.contains("HTTP") {
                "Download failed".to_string()
            } else {
                "Download failed".to_string()
            }
        }
        DownloadError::Network(_) => "Network error during download".to_string(),
        DownloadError::AuthFailed => "Authentication failed".to_string(),
        DownloadError::Forbidden => "Access to this file is forbidden".to_string(),
        DownloadError::NotFound => "Download resource not found".to_string(),
        DownloadError::RateLimited => "Rate limited by server".to_string(),
        DownloadError::Server(_) => "Server error during download".to_string(),
        DownloadError::ContentTypeMismatch(_, _) => "Content type mismatch".to_string(),
        DownloadError::SizeExceeded(_, _) => "Download too large".to_string(),
        DownloadError::LengthMismatch(expected, actual) => {
            format!("Download size mismatch: expected {expected} bytes, received {actual} bytes")
        }
        DownloadError::HashMismatch(algorithm, _) => {
            format!("Checksum verification failed ({algorithm})")
        }
        DownloadError::InvalidZip(msg) => format!("Invalid EPUB archive: {msg}"),
        DownloadError::InvalidDestination(_) => "Invalid download destination".to_string(),
        DownloadError::IoError => "IO error during download".to_string(),
        DownloadError::IncompleteDownload => "Download incomplete".to_string(),
        DownloadError::Cancelled => "Download cancelled".to_string(),
    }
}

#[allow(dead_code)]
pub(crate) fn validate_download_params(url: &Url) -> Result<(), String> {
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Invalid URL: only HTTP and HTTPS schemes are allowed".to_string());
    }

    if !url.username().is_empty() {
        return Err("Invalid URL: credentials must not be embedded in URL".to_string());
    }

    Ok(())
}

#[command]
pub async fn fetch_opds_catalog(
    url: String,
    username: String,
    password: String,
    page: Option<u32>,
    page_size: Option<u32>,
) -> Result<Catalog, AppError> {
    let parsed_url = Url::parse(&url)
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

    let config = CatalogConfig::new("opds", parsed_url, username, password)?;

    let client = OpdsClient::new(config)?;

    if page.is_none() && page_size.is_none() {
        let catalog = client.fetch_catalog().await?;
        Ok(catalog)
    } else {
        let page = page.unwrap_or(1).max(1);
        let page_size = page_size.unwrap_or(50).clamp(1, 100);

        let pagination = ClientPagination::new(page, page_size);

        let catalog = client.fetch_page(Some(pagination)).await?;

        Ok(catalog)
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

    let result = download_file(&plan, &context, content_root_path, progress_callback).await;

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
    use axum::{http::StatusCode, routing::get, Router};
    use axum_test::TestServer;

    fn make_opds_feed() -> &'static str {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>OPDS Catalog</title>
  <updated>2024-01-15T10:30:00Z</updated>
  <author>
    <name>OPDS Server</name>
  </author>
  <link href="/opds" rel="self" type="application/atom+xml"/>
  <entry>
    <id>book-1</id>
    <title>Test Book</title>
    <author>Test Author</author>
    <id scheme="isbn">978-0000000001</id>
    <link href="/download/book-1.epub" rel="acquisition" type="application/epub+zip"/>
  </entry>
</feed>"#
    }

    #[tokio::test]
    async fn test_fetch_opds_catalog_success() {
        let feed = make_opds_feed();
        let app = Router::new()
            .route(
                "/opds",
                get(move || async { (StatusCode::OK, feed.to_string()) }),
            )
            .route(
                "/opds/",
                get(move || async { (StatusCode::OK, feed.to_string()) }),
            );
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let result = fetch_opds_catalog(
            url.to_string(),
            "testuser".to_string(),
            "testpass".to_string(),
            None,
            None,
        )
        .await;

        assert!(result.is_ok());
        let catalog = result.unwrap();
        assert_eq!(catalog.title, "OPDS Catalog");
        assert_eq!(catalog.publications.len(), 1);
        assert_eq!(catalog.publications[0].title, "Test Book");
    }

    #[tokio::test]
    async fn test_fetch_opds_catalog_invalid_url_scheme() {
        let result = fetch_opds_catalog(
            "ftp://example.com/opds".to_string(),
            "user".to_string(),
            "pass".to_string(),
            None,
            None,
        )
        .await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        if let AppError::OpdsTransport(msg) = err {
            assert!(msg.contains("HTTP") || msg.contains("HTTP and HTTPS"));
        } else {
            panic!("Expected OpdsTransport error");
        }
    }

    #[tokio::test]
    async fn test_fetch_opds_catalog_credentials_in_url() {
        let result = fetch_opds_catalog(
            "https://user:pass@example.com/opds".to_string(),
            "user".to_string(),
            "pass".to_string(),
            None,
            None,
        )
        .await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        if let AppError::OpdsTransport(msg) = err {
            assert!(msg.contains("credentials must not be embedded"));
        } else {
            panic!("Expected OpdsTransport error");
        }
    }

    #[tokio::test]
    async fn test_fetch_opds_catalog_pagination_clamps_page_size() {
        let feed = make_opds_feed();
        let app = Router::new().route(
            "/opds",
            get(move || async { (StatusCode::OK, feed.to_string()) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let result = fetch_opds_catalog(
            url.to_string(),
            "user".to_string(),
            "pass".to_string(),
            Some(0),
            Some(200),
        )
        .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_fetch_opds_catalog_authentication_failure() {
        let app = Router::new().route("/opds", get(|| async { (StatusCode::UNAUTHORIZED, "") }));
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let result = fetch_opds_catalog(
            url.to_string(),
            "baduser".to_string(),
            "badpass".to_string(),
            None,
            None,
        )
        .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_fetch_opds_catalog_not_found() {
        let app = Router::new().route("/opds", get(|| async { (StatusCode::NOT_FOUND, "") }));
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let result = fetch_opds_catalog(
            url.to_string(),
            "user".to_string(),
            "pass".to_string(),
            None,
            None,
        )
        .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_fetch_opds_catalog_routes_root_vs_paginated() {
        use axum::extract::Query;
        use serde::Deserialize;

        #[derive(Debug, Deserialize)]
        struct PaginationQuery {
            page: Option<u32>,
            size: Option<u32>,
        }

        async fn handle_opds(
            Query(query): Query<PaginationQuery>,
        ) -> (axum::http::StatusCode, String) {
            if query.page.is_some() || query.size.is_some() {
                (
                    StatusCode::OK,
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>PaginatedFeed</title>
</feed>"#
                        .to_string(),
                )
            } else {
                (
                    StatusCode::OK,
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>OPDS Catalog</title>
</feed>"#
                        .to_string(),
                )
            }
        }

        let app = Router::new()
            .route("/opds", get(handle_opds))
            .route("/opds/", get(handle_opds));
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let result = fetch_opds_catalog(
            url.to_string(),
            "user".to_string(),
            "pass".to_string(),
            Some(2),
            None,
        )
        .await;

        assert!(result.is_ok());
        let catalog = result.unwrap();
        assert_eq!(catalog.title, "PaginatedFeed");
    }

    #[tokio::test]
    async fn test_fetch_opds_catalog_uses_root_url_when_no_pagination() {
        use axum::extract::Query;
        use serde::Deserialize;

        #[derive(Debug, Deserialize)]
        struct PaginationQuery {
            _page: Option<u32>,
            _size: Option<u32>,
        }

        async fn handle_root(_query: Query<PaginationQuery>) -> (axum::http::StatusCode, String) {
            (
                StatusCode::OK,
                r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>OPDS Catalog</title>
</feed>"#
                    .to_string(),
            )
        }

        let app = Router::new()
            .route("/opds", get(handle_root))
            .route("/opds/", get(handle_root));
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let result = fetch_opds_catalog(
            url.to_string(),
            "user".to_string(),
            "pass".to_string(),
            None,
            None,
        )
        .await;

        assert!(result.is_ok());
        let catalog = result.unwrap();
        assert_eq!(catalog.title, "OPDS Catalog");
    }

    #[test]
    fn test_validate_download_params_valid_http() {
        let url = Url::parse("http://example.com/opds").unwrap();
        let result = validate_download_params(&url);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_download_params_valid_https() {
        let url = Url::parse("https://example.com/opds").unwrap();
        let result = validate_download_params(&url);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_download_params_invalid_scheme() {
        let url = Url::parse("ftp://example.com/opds").unwrap();
        let result = validate_download_params(&url);
        assert!(result.is_err());
        if let Err(msg) = result {
            assert!(msg.contains("HTTP") || msg.contains("HTTPS"));
        }
    }

    #[test]
    fn test_validate_download_params_credentials_in_url() {
        let url = Url::parse("https://user:pass@example.com/opds").unwrap();
        let result = validate_download_params(&url);
        assert!(result.is_err());
        if let Err(msg) = result {
            assert!(msg.contains("credentials") || msg.contains("embedded"));
        }
    }

    #[test]
    fn test_sanitize_error_message_no_credential_exposure() {
        use crate::opds::DownloadError;

        let err =
            DownloadError::Transport("credentials in URL: user=secret, pass=hidden".to_string());
        let msg = sanitize_error_message(&err);
        assert!(!msg.contains("secret"));
        assert!(!msg.contains("hidden"));
        assert!(msg.contains("Authentication") || msg.contains("failed"));
    }

    #[test]
    fn test_sanitize_error_message_content_type() {
        use crate::opds::DownloadError;

        let err = DownloadError::ContentTypeMismatch(
            "application/epub+zip".to_string(),
            "text/html".to_string(),
        );
        let msg = sanitize_error_message(&err);
        assert!(msg.contains("Content type"));
    }

    #[test]
    fn test_sanitize_error_message_cross_origin() {
        use crate::opds::DownloadError;

        let err = DownloadError::Transport(
            "cross-origin download from https://evil.com rejected".to_string(),
        );
        let msg = sanitize_error_message(&err);
        assert!(!msg.contains("evil.com"));
    }
}
