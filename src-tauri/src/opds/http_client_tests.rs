#[cfg(test)]
mod tests {
    use crate::opds::errors::OpdsTransportError;
    use crate::opds::transport::CatalogConfig;
    use crate::opds::OpdsClient;
    use axum::{http::StatusCode, routing::get, Router};
    use axum_test::TestServer;
    use url::Url;

    fn make_test_config(url: &str, username: &str, password: String) -> CatalogConfig {
        CatalogConfig::new("grimmory", Url::parse(url).unwrap(), username, password).unwrap()
    }

    #[tokio::test]
    async fn test_fetch_root_catalog_success() {
        let feed = include_str!("../../test/fixtures/opds/root_catalog.xml");
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

        let config = make_test_config(&url.to_string(), "testuser", "testpass".to_string());
        let client = OpdsClient::new(config).unwrap();
        let result = client.fetch_catalog().await;

        assert!(result.is_ok());
        let catalog = result.unwrap();
        assert_eq!(catalog.title, "Grimmory OPDS");
    }

    #[tokio::test]
    async fn test_auth_header_sent() {
        use axum::body::Body;
        use axum::middleware::from_fn;
        use axum::{middleware::Next, Router};

        let feed = include_str!("../../test/fixtures/opds/root_catalog.xml");
        let app = Router::new()
            .route(
                "/opds",
                get(move || async { (StatusCode::OK, feed.to_string()) }),
            )
            .route(
                "/opds/",
                get(move || async { (StatusCode::OK, feed.to_string()) }),
            );

        let app = app.layer(from_fn(
            |req: axum::http::Request<Body>, next: Next| async move {
                let headers = req.headers();
                let auth_header = headers
                    .get(axum::http::header::AUTHORIZATION)
                    .map(|v| v.to_str().unwrap_or(""));
                let expected_auth = "Basic dXNlcjpwYXNz";
                assert_eq!(
                    auth_header,
                    Some(expected_auth),
                    "Authorization header not sent correctly"
                );
                next.run(req).await
            },
        ));

        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let config = make_test_config(&url.to_string(), "user", "pass".to_string());
        let client = OpdsClient::new(config).unwrap();
        let result = client.fetch_catalog().await;

        assert!(result.is_ok(), "Request with valid config should succeed");
    }

    #[tokio::test]
    async fn test_auth_failure_401() {
        let app = Router::new()
            .route("/opds", get(|| async { (StatusCode::UNAUTHORIZED, "") }))
            .route("/opds/", get(|| async { (StatusCode::UNAUTHORIZED, "") }));
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let config = make_test_config(&url.to_string(), "user", "pass".to_string());
        let client = OpdsClient::new(config).unwrap();
        let result = client.fetch_catalog().await;

        assert!(matches!(result, Err(OpdsTransportError::Unauthorized)));
    }

    #[tokio::test]
    async fn test_forbidden_403() {
        let app = Router::new()
            .route("/opds", get(|| async { (StatusCode::FORBIDDEN, "") }))
            .route("/opds/", get(|| async { (StatusCode::FORBIDDEN, "") }));
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let config = make_test_config(&url.to_string(), "user", "pass".to_string());
        let client = OpdsClient::new(config).unwrap();
        let result = client.fetch_catalog().await;

        assert!(matches!(result, Err(OpdsTransportError::Forbidden)));
    }

    #[tokio::test]
    async fn test_not_found_404() {
        let app = Router::new()
            .route("/opds", get(|| async { (StatusCode::NOT_FOUND, "") }))
            .route("/opds/", get(|| async { (StatusCode::NOT_FOUND, "") }));
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let config = make_test_config(&url.to_string(), "user", "pass".to_string());
        let client = OpdsClient::new(config).unwrap();
        let result = client.fetch_catalog().await;

        assert!(matches!(result, Err(OpdsTransportError::NotFound)));
    }

    #[tokio::test]
    async fn test_rate_limited_429() {
        let app = Router::new()
            .route(
                "/opds",
                get(|| async { (StatusCode::TOO_MANY_REQUESTS, "") }),
            )
            .route(
                "/opds/",
                get(|| async { (StatusCode::TOO_MANY_REQUESTS, "") }),
            );
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let config = make_test_config(&url.to_string(), "user", "pass".to_string());
        let client = OpdsClient::new(config).unwrap();
        let result = client.fetch_catalog().await;

        assert!(matches!(result, Err(OpdsTransportError::RateLimited)));
    }

    #[tokio::test]
    async fn test_server_error_500() {
        let app = Router::new()
            .route(
                "/opds",
                get(|| async { (StatusCode::INTERNAL_SERVER_ERROR, "") }),
            )
            .route(
                "/opds/",
                get(|| async { (StatusCode::INTERNAL_SERVER_ERROR, "") }),
            );
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let config = make_test_config(&url.to_string(), "user", "pass".to_string());
        let client = OpdsClient::new(config).unwrap();
        let result = client.fetch_catalog().await;

        assert!(matches!(result, Err(OpdsTransportError::ServerError(500))));
    }

    #[tokio::test]
    async fn test_server_error_503() {
        let app = Router::new()
            .route(
                "/opds",
                get(|| async { (StatusCode::SERVICE_UNAVAILABLE, "") }),
            )
            .route(
                "/opds/",
                get(|| async { (StatusCode::SERVICE_UNAVAILABLE, "") }),
            );
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let config = make_test_config(&url.to_string(), "user", "pass".to_string());
        let client = OpdsClient::new(config).unwrap();
        let result = client.fetch_catalog().await;

        assert!(matches!(result, Err(OpdsTransportError::ServerError(503))));
    }

    #[tokio::test]
    async fn test_pagination_next_link() {
        let page1 = include_str!("../../test/fixtures/opds/paginated_catalog_page_1.xml");
        let page2 = include_str!("../../test/fixtures/opds/paginated_catalog_page_2.xml");

        let app = Router::new()
            .route(
                "/opds",
                get(move || async { (StatusCode::OK, page1.to_string()) }),
            )
            .route(
                "/opds/",
                get(move || async { (StatusCode::OK, page1.to_string()) }),
            )
            .route(
                "/opds/catalog",
                get(move || async { (StatusCode::OK, page2.to_string()) }),
            );
        let server = TestServer::builder().http_transport().build(app);
        let url = server.server_url("/opds").unwrap();

        let config = make_test_config(&url.to_string(), "user", "pass".to_string());
        let client = OpdsClient::new(config).unwrap();
        let result = client.fetch_catalog().await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cross_origin_rejected() {
        let config = make_test_config(
            "https://example.com/api/v1/opds",
            "user",
            "pass".to_string(),
        );
        let client = OpdsClient::new(config).unwrap();

        let result = client.fetch_feed("https://evil.com/api/v1/opds").await;
        assert!(matches!(result, Err(OpdsTransportError::InvalidRedirect)));
    }

    #[tokio::test]
    async fn test_fetch_feed_rejects_credentials_in_url() {
        let config = make_test_config("https://example.com/opds", "user", "pass".to_string());
        let client = OpdsClient::new(config).unwrap();

        let result = client
            .fetch_feed("https://user:pass@example.com/opds")
            .await;
        assert!(matches!(result, Err(OpdsTransportError::CredentialInUrl)));
    }

    #[tokio::test]
    async fn test_fetch_feed_rejects_cross_origin() {
        let config = make_test_config(
            "https://example.com:8443/api/v1/opds",
            "user",
            "pass".to_string(),
        );
        let client = OpdsClient::new(config).unwrap();

        let result = client.fetch_feed("https://other.com/api/v1/opds").await;
        assert!(matches!(result, Err(OpdsTransportError::InvalidRedirect)));
    }

    #[test]
    fn test_feed_size_limit_parser() {
        let large_xml: String = "X".repeat((21 * 1024 * 1024) as usize);
        let large_xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>{}</title>
</feed>"#,
            large_xml
        );
        let result = crate::opds::parser::parse_catalog(&large_xml);
        assert!(result.is_err());
    }

    #[test]
    fn test_opds_client_creation() {
        let config = make_test_config("https://example.com/opds", "user", "pass".to_string());
        let client = OpdsClient::new(config);
        assert!(client.is_ok());
    }

    #[test]
    fn test_opds_client_base_url() {
        let config = make_test_config(
            "https://example.com/api/v1/opds",
            "user",
            "pass".to_string(),
        );
        let client = OpdsClient::new(config).unwrap();
        assert_eq!(client.base_url(), "https://example.com/api/v1/opds/");
    }

    #[test]
    fn test_catalog_url_returns_configured_url() {
        let url = Url::parse("https://example.com/opds").unwrap();
        let config = CatalogConfig::new("grimmory", url, "user", "pass".to_string()).unwrap();
        assert_eq!(config.catalog_url(), "https://example.com/opds");
    }

    #[test]
    fn test_pagination_url_replaces_page_size() {
        let url = Url::parse("https://example.com/opds?page=1&size=50&existing=param").unwrap();
        let config = CatalogConfig::new("grimmory", url, "user", "pass".to_string()).unwrap();
        let pagination_url = config.pagination_url(2, 100);
        assert!(pagination_url.is_some());
        let url_str = pagination_url.unwrap();
        assert!(url_str.contains("page=2"));
        assert!(url_str.contains("size=100"));
        assert!(url_str.contains("existing=param"));
        let page_count = url_str.matches("page=").count();
        assert_eq!(page_count, 1, "page should not be duplicated");
        let size_count = url_str.matches("size=").count();
        assert_eq!(size_count, 1, "size should not be duplicated");
    }
}
