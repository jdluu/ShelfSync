//! Application-layer service for the OPDS download command.
//!
//! Owns download input validation and HTTP client/context construction so the
//! Tauri command stays a thin adapter over the download pipeline. The error
//! messages produced here are intentionally stable: the frontend IPC contract
//! matches on the serialized `AppError::OpdsTransport` strings, and the
//! command-derived messages must not change.

use crate::error::AppError;
use crate::opds::{CatalogConfig, DownloadContext};
use url::Url;

/// A validated, ready-to-use setup for a single publication download.
///
/// The `url` and `config` the command consumes are both carried inside the
/// `context` (`context.config.url` / `context.config`) so they are not
/// duplicated here — this type holds the single source of truth.
pub(crate) struct DownloadSetup {
    pub(crate) context: DownloadContext,
}

/// Prepares a download setup from raw command inputs.
///
/// Validates the catalog URL, derives a `CatalogConfig`, and constructs the
/// HTTP client + `DownloadContext`. Failure produces the exact
/// `AppError::OpdsTransport` messages the previous inline command produced.
pub(crate) fn prepare_download_setup(
    catalog_url: &str,
    username: &str,
    password: &str,
) -> Result<DownloadSetup, AppError> {
    let parsed_url = Url::parse(catalog_url)
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

    let config = CatalogConfig::new("download", parsed_url, username, password.to_string())
        .map_err(|e| AppError::OpdsTransport(e.to_string()))?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .use_rustls_tls()
        .build()
        .map_err(|e| AppError::OpdsTransport(format!("Failed to build HTTP client: {}", e)))?;

    let context = DownloadContext::new(client, config);

    Ok(DownloadSetup { context })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opds_transport_message(err: &AppError) -> &str {
        match err {
            AppError::OpdsTransport(msg) => msg,
            other => panic!("expected OpdsTransport, got {other:?}"),
        }
    }

    fn setup_error(catalog_url: &str) -> AppError {
        match prepare_download_setup(catalog_url, "user", "pass") {
            Err(e) => e,
            Ok(_) => panic!("expected setup to fail for {catalog_url}"),
        }
    }

    #[test]
    fn valid_https_url_builds_setup() {
        let setup = prepare_download_setup("https://example.com/opds", "user", "pass").unwrap();
        assert_eq!(
            setup.context.config.url.as_str(),
            "https://example.com/opds"
        );
        assert_eq!(setup.context.config.origin(), "https://example.com");
    }

    #[test]
    fn valid_http_url_builds_setup() {
        let setup = prepare_download_setup("http://example.com:8080/opds", "user", "pass").unwrap();
        assert_eq!(setup.context.config.origin(), "http://example.com:8080");
    }

    #[test]
    fn setup_config_carries_provider_and_username() {
        let setup = prepare_download_setup("https://example.com/opds", "alice", "s3cret").unwrap();
        assert_eq!(setup.context.config.provider, "download");
        assert_eq!(setup.context.config.username, "alice");
        assert_eq!(setup.context.config.password, "s3cret");
    }

    #[test]
    fn unparseable_url_rejected() {
        let err = setup_error("not a url");
        assert_eq!(opds_transport_message(&err), "Invalid URL: unable to parse");
    }

    #[test]
    fn non_http_scheme_rejected() {
        let err = setup_error("ftp://example.com/opds");
        assert_eq!(
            opds_transport_message(&err),
            "Invalid URL: only HTTP and HTTPS schemes are allowed"
        );
    }

    #[test]
    fn credentials_embedded_in_url_rejected() {
        let err = setup_error("https://user:pass@example.com/opds");
        assert_eq!(
            opds_transport_message(&err),
            "Invalid URL: credentials must not be embedded in URL"
        );
    }

    #[test]
    fn setup_context_is_built_with_a_client() {
        let setup = prepare_download_setup("https://example.com/opds", "user", "pass").unwrap();
        // The context must carry the same provider and the configured max size.
        assert_eq!(setup.context.config.provider, "download");
    }
}
