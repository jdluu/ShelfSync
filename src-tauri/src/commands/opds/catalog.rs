use crate::error::AppError;
use crate::opds::{Catalog, CatalogConfig, ClientPagination, OpdsClient};
use tauri::command;
use url::Url;

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
}
