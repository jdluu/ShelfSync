use crate::opds::errors::OpdsTransportError;
use crate::opds::parser::parse_catalog_from_str;
use crate::opds::transport::{origin_matches, DEFAULT_PAGE_SIZE, MAX_FEED_SIZE, MAX_PAGE_SIZE};
use crate::opds::{Catalog, CatalogConfig, Pagination};
use base64::Engine;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use reqwest::{Client, Response, StatusCode};
use std::time::Duration;
use url::Url;

const DEFAULT_TIMEOUT_SECS: u64 = 30;

pub struct OpdsClient {
    config: CatalogConfig,
    http_client: Client,
}

impl OpdsClient {
    pub fn new(config: CatalogConfig) -> Result<Self, OpdsTransportError> {
        let http_client = Client::builder()
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .redirect(reqwest::redirect::Policy::none())
            .use_rustls_tls()
            .build()
            .map_err(|e| {
                OpdsTransportError::InvalidUrl(format!("Failed to build HTTP client: {}", e))
            })?;

        Ok(OpdsClient {
            http_client,
            config,
        })
    }

    pub fn config(&self) -> &CatalogConfig {
        &self.config
    }

    pub async fn fetch_catalog(&self) -> Result<Catalog, OpdsTransportError> {
        self.fetch_page(None).await
    }

    pub async fn fetch_page(
        &self,
        pagination: Option<ClientPagination>,
    ) -> Result<Catalog, OpdsTransportError> {
        let url = match pagination {
            Some(ref p) => self.config.pagination_url(p.page, p.size).ok_or_else(|| {
                OpdsTransportError::InvalidUrl("Failed to build pagination URL".to_string())
            })?,
            None => self.config.url.to_string(),
        };

        self.fetch_feed(&url).await
    }

    pub async fn fetch_feed(&self, url_str: &str) -> Result<Catalog, OpdsTransportError> {
        let url = Url::parse(url_str)
            .map_err(|_| OpdsTransportError::InvalidUrl("Invalid URL".to_string()))?;

        if !url.username().is_empty() || url.password().is_some() {
            return Err(OpdsTransportError::CredentialInUrl);
        }

        let config_origin = self.config.origin();
        if !origin_matches(&url, &config_origin) {
            return Err(OpdsTransportError::InvalidRedirect);
        }

        let headers = self.build_headers(&url);

        let response = self
            .http_client
            .get(url)
            .headers(headers)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    OpdsTransportError::Timeout(DEFAULT_TIMEOUT_SECS)
                } else {
                    OpdsTransportError::NetworkError
                }
            })?;

        self.handle_response(response).await
    }

    fn build_headers(&self, url: &Url) -> HeaderMap {
        let mut headers = HeaderMap::new();

        let config_origin = self.config.origin();
        if origin_matches(url, &config_origin) {
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

    async fn handle_response(&self, response: Response) -> Result<Catalog, OpdsTransportError> {
        use futures_util::StreamExt;

        let status = response.status();

        match status {
            StatusCode::OK => {
                if let Some(size) = response.content_length() {
                    if size > MAX_FEED_SIZE {
                        return Err(OpdsTransportError::FeedTooLarge(size));
                    }
                }

                let mut body = String::new();
                let mut received: u64 = 0;
                let mut stream = response.bytes_stream();
                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.map_err(|_| {
                        OpdsTransportError::InvalidXml("Failed to read response body".to_string())
                    })?;
                    let chunk_len = chunk.len() as u64;
                    received += chunk_len;
                    if received > MAX_FEED_SIZE {
                        return Err(OpdsTransportError::FeedTooLarge(received));
                    }
                    body.push_str(std::str::from_utf8(&chunk).map_err(|_| {
                        OpdsTransportError::InvalidXml("Invalid UTF-8 in response".to_string())
                    })?);
                }

                parse_catalog_from_str(&body)
                    .map_err(|e| OpdsTransportError::InvalidXml(e.to_string()))
            }
            StatusCode::UNAUTHORIZED => Err(OpdsTransportError::Unauthorized),
            StatusCode::FORBIDDEN => Err(OpdsTransportError::Forbidden),
            StatusCode::NOT_FOUND => Err(OpdsTransportError::NotFound),
            StatusCode::TOO_MANY_REQUESTS => Err(OpdsTransportError::RateLimited),
            s if s.is_server_error() => Err(OpdsTransportError::ServerError(s.as_u16())),
            s => Err(OpdsTransportError::InvalidUrl(format!(
                "Unexpected status code: {}",
                s
            ))),
        }
    }

    pub fn base_url(&self) -> String {
        self.config.base_url()
    }

    pub fn origin(&self) -> String {
        self.config.origin()
    }
}

#[derive(Debug, Clone)]
pub struct ClientPagination {
    pub page: u32,
    pub size: u32,
}

impl Default for ClientPagination {
    fn default() -> Self {
        ClientPagination {
            page: 1,
            size: DEFAULT_PAGE_SIZE,
        }
    }
}

impl ClientPagination {
    pub fn new(page: u32, size: u32) -> Self {
        ClientPagination {
            page: if page == 0 { 1 } else { page },
            size: if size == 0 {
                DEFAULT_PAGE_SIZE
            } else {
                size.clamp(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
            },
        }
    }
}

impl From<ClientPagination> for Pagination {
    fn from(p: ClientPagination) -> Self {
        Pagination {
            page: p.page,
            size: p.size,
            total: None,
            next: None,
        }
    }
}
