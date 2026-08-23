//! HTTP transport for the Grimmory KOReader sync protocol.
//!
//! Every request carries HTTP Basic auth built from the dedicated KOReader
//! credentials. Redirects are refused so credentials can never leak to a
//! different origin, mirroring the OPDS transport policy.

use crate::credentials::OpdsCredentials;
use crate::progress::adapter::ProgressAdapter;
use crate::progress::error::ProgressSyncError;
use crate::progress::model::KoReaderProgress;
use base64::Engine;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use reqwest::{Client, Method, RequestBuilder, StatusCode};
use std::time::Duration;
use url::Url;

pub const DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 15;

const MAX_RESPONSE_BYTES: u64 = 256 * 1024;

/// Connection settings for one KOReader sync account.
#[derive(Clone)]
pub struct KoReaderSyncConfig {
    api_base_url: Url,
    credentials: OpdsCredentials,
}

impl KoReaderSyncConfig {
    /// Validates and normalizes the user supplied API path (for example
    /// `http://192.168.0.2:6060/api/koreader`). Embedded URL credentials are
    /// rejected; only HTTP and HTTPS are accepted.
    pub fn new(
        api_base_url: &str,
        credentials: OpdsCredentials,
    ) -> Result<Self, ProgressSyncError> {
        let mut url = Url::parse(api_base_url)
            .map_err(|_| ProgressSyncError::InvalidConfig("base url failed to parse".to_string()))?;
        match url.scheme() {
            "http" | "https" => {}
            other => {
                return Err(ProgressSyncError::InvalidConfig(format!(
                    "unsupported scheme {other}"
                )))
            }
        }
        if !url.username().is_empty() || url.password().is_some() {
            return Err(ProgressSyncError::InvalidConfig(
                "credentials must not be embedded in the base url".to_string(),
            ));
        }
        if url.host_str().unwrap_or_default().is_empty() {
            return Err(ProgressSyncError::InvalidConfig(
                "base url has no host".to_string(),
            ));
        }
        url.set_query(None);
        url.set_fragment(None);
        let path = url.path().trim_end_matches('/').to_string();
        url.set_path(&path);
        Ok(KoReaderSyncConfig {
            api_base_url: url,
            credentials,
        })
    }

    fn endpoint(&self, suffix: &str) -> Url {
        let mut url = self.api_base_url.clone();
        let base_path = url.path().trim_end_matches('/');
        url.set_path(&format!("{base_path}/{suffix}"));
        url
    }

    pub fn origin(&self) -> String {
        self.api_base_url.origin().ascii_serialization()
    }
}

/// Reqwest backed [`ProgressAdapter`] for the Grimmory KOReader endpoints.
pub struct KoReaderSyncClient {
    config: KoReaderSyncConfig,
    http: Client,
}

impl KoReaderSyncClient {
    pub fn new(config: KoReaderSyncConfig) -> Result<Self, ProgressSyncError> {
        let http = Client::builder()
            .timeout(Duration::from_secs(DEFAULT_REQUEST_TIMEOUT_SECS))
            .redirect(reqwest::redirect::Policy::none())
            .use_rustls_tls()
            .build()
            .map_err(|e| ProgressSyncError::InvalidConfig(format!("http client build failed: {e}")))?;
        Ok(KoReaderSyncClient { config, http })
    }

    pub fn config(&self) -> &KoReaderSyncConfig {
        &self.config
    }

    fn auth_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        let raw = format!(
            "{}:{}",
            self.config.credentials.username, self.config.credentials.password
        );
        let encoded = base64::engine::general_purpose::STANDARD.encode(raw.as_bytes());
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Basic {}", encoded))
                .expect("basic auth header is valid ascii"),
        );
        headers
    }

    async fn execute(
        &self,
        builder: RequestBuilder,
    ) -> Result<(StatusCode, String), ProgressSyncError> {
        let response = builder.send().await.map_err(|err| {
            if err.is_timeout() {
                ProgressSyncError::Timeout
            } else {
                ProgressSyncError::Network
            }
        })?;
        let status = response.status();
        if status.is_redirection() {
            return Err(ProgressSyncError::Redirect);
        }
        match status {
            StatusCode::UNAUTHORIZED => return Err(ProgressSyncError::Unauthorized),
            StatusCode::FORBIDDEN => return Err(ProgressSyncError::Forbidden),
            // 404 is meaningful for progress reads ("nothing recorded yet")
            // and is handed back to the caller for interpretation.
            StatusCode::NOT_FOUND => {}
            s if !s.is_success() => return Err(ProgressSyncError::Server(s.as_u16())),
            _ => {}
        }
        if let Some(len) = response.content_length() {
            if len > MAX_RESPONSE_BYTES {
                return Err(ProgressSyncError::Malformed("response too large".to_string()));
            }
        }
        let body = response.text().await.map_err(|_| ProgressSyncError::Network)?;
        Ok((status, body))
    }

    fn request(&self, method: Method, url: Url) -> RequestBuilder {
        let mut headers = self.auth_headers();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        self.http.request(method, url).headers(headers)
    }

    fn validate_document_hash(hash: &str) -> Result<(), ProgressSyncError> {
        if hash.len() == 32 && hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            Ok(())
        } else {
            Err(ProgressSyncError::InvalidInput(
                "document hash must be a 32 character hex digest".to_string(),
            ))
        }
    }
}

#[async_trait::async_trait]
impl ProgressAdapter for KoReaderSyncClient {
    async fn authorize(&self) -> Result<(), ProgressSyncError> {
        let url = self.config.endpoint("users/auth");
        let (status, _) = self.execute(self.request(Method::GET, url)).await?;
        if !status.is_success() {
            return Err(ProgressSyncError::Server(status.as_u16()));
        }
        Ok(())
    }

    async fn get_progress(
        &self,
        document_hash: &str,
    ) -> Result<Option<KoReaderProgress>, ProgressSyncError> {
        Self::validate_document_hash(document_hash)?;
        let url = self.config.endpoint(&format!("syncs/progress/{document_hash}"));
        let (status, body) = self.execute(self.request(Method::GET, url)).await?;
        if status == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let progress =
            serde_json::from_str::<KoReaderProgress>(&body).map_err(|err| {
                ProgressSyncError::Malformed(format!("invalid progress payload: {err}"))
            })?;
        Ok(Some(progress))
    }

    async fn put_progress(&self, progress: &KoReaderProgress) -> Result<(), ProgressSyncError> {
        Self::validate_document_hash(&progress.document)?;
        let url = self.config.endpoint("syncs/progress");
        let (status, _) = self
            .execute(self.request(Method::PUT, url).json(progress))
            .await?;
        if !status.is_success() {
            return Err(ProgressSyncError::Server(status.as_u16()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(base: &str) -> KoReaderSyncConfig {
        KoReaderSyncConfig::new(base, OpdsCredentials::new("reader", "secret")).unwrap()
    }

    #[test]
    fn endpoint_joining_handles_trailing_slashes_and_subpaths() {
        let cfg = config("http://192.168.0.2:6060/api/koreader/");
        assert_eq!(
            cfg.endpoint("users/auth").as_str(),
            "http://192.168.0.2:6060/api/koreader/users/auth"
        );
        assert_eq!(
            config("http://h:1/api/koreader")
                .endpoint("syncs/progress/abc")
                .as_str(),
            "http://h:1/api/koreader/syncs/progress/abc"
        );
    }

    #[test]
    fn query_and_fragment_are_stripped_from_base() {
        let cfg = config("https://books.example.com/api/koreader?x=1#frag");
        assert_eq!(cfg.endpoint("users/auth").as_str(), "https://books.example.com/api/koreader/users/auth");
    }

    #[test]
    fn invalid_bases_are_rejected() {
        assert!(
            KoReaderSyncConfig::new("ftp://books.example.com", OpdsCredentials::new("u", "p"))
                .is_err()
        );
        assert!(KoReaderSyncConfig::new(
            "http://user:pass@books.example.com/api/koreader",
            OpdsCredentials::new("u", "p")
        )
        .is_err());
        assert!(KoReaderSyncConfig::new("not a url", OpdsCredentials::new("u", "p")).is_err());
    }

    #[test]
    fn document_hashes_must_be_32_hex_characters() {
        assert!(KoReaderSyncClient::validate_document_hash(
            "d41d8cd98f00b204e9800998ecf8427e"
        )
        .is_ok());
        assert!(KoReaderSyncClient::validate_document_hash("D41D8CD98F00B204E9800998ECF8427E").is_ok());
        assert!(KoReaderSyncClient::validate_document_hash("short").is_err());
        assert!(KoReaderSyncClient::validate_document_hash("../../etc/passwd").is_err());
        assert!(KoReaderSyncClient::validate_document_hash("").is_err());
    }
}
