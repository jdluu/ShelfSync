use crate::opds::errors::OpdsTransportError;
use serde::{Deserialize, Serialize};
use url::Url;

pub const DEFAULT_PAGE_SIZE: u32 = 50;
pub const MAX_PAGE_SIZE: u32 = 100;
pub const MAX_FEED_SIZE: u64 = 10 * 1024 * 1024;
pub const DEFAULT_HTTP_PORT: u16 = 80;
pub const DEFAULT_HTTPS_PORT: u16 = 443;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedOrigin {
    scheme: String,
    host: String,
    port: Option<u16>,
}

impl ParsedOrigin {
    pub fn from_url(url: &Url) -> Self {
        let scheme = url.scheme().to_string();
        let host = url.host_str().unwrap_or("").to_string();
        let port = url.port();
        ParsedOrigin { scheme, host, port }
    }

    pub fn scheme(&self) -> &str {
        &self.scheme
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn from_origin_str(origin: &str) -> Self {
        if origin.is_empty() {
            return ParsedOrigin {
                scheme: String::new(),
                host: String::new(),
                port: None,
            };
        }

        let default_port = if origin.starts_with("https://") {
            Some(DEFAULT_HTTPS_PORT)
        } else if origin.starts_with("http://") {
            Some(DEFAULT_HTTP_PORT)
        } else {
            None
        };

        let (scheme, rest) = if let Some(pos) = origin.find("://") {
            (&origin[..pos], &origin[pos + 3..])
        } else {
            ("", origin)
        };

        let (host, port) = if rest.starts_with('[') {
            if let Some(close_bracket) = rest.find(']') {
                let host = &rest[..close_bracket + 1];
                let after_bracket = &rest[close_bracket + 1..];
                if let Some(port_str) = after_bracket.strip_prefix(':') {
                    let port = port_str.parse::<u16>().ok();
                    (host.to_string(), port)
                } else {
                    (host.to_string(), default_port)
                }
            } else {
                (rest.to_string(), default_port)
            }
        } else if rest.contains(':') && !rest.starts_with('/') {
            let period_pos = rest.find(':').unwrap();
            let potential_host = &rest[..period_pos];
            let after_colon = &rest[period_pos + 1..];
            let port = after_colon.parse::<u16>().ok();
            (potential_host.to_string(), port)
        } else {
            (rest.to_string(), default_port)
        };

        ParsedOrigin {
            scheme: scheme.to_string(),
            host,
            port,
        }
    }

    pub fn from_url_str(url: &Url) -> Self {
        Self::from_url(url)
    }

    pub fn normalize_for_comparison(&self) -> String {
        let default_port = if self.scheme == "https" {
            DEFAULT_HTTPS_PORT
        } else {
            DEFAULT_HTTP_PORT
        };
        if let Some(port) = self.port {
            if port == default_port {
                format!("{}://{}", self.scheme, self.host)
            } else {
                format!("{}://{}:{}", self.scheme, self.host, port)
            }
        } else {
            format!("{}://{}", self.scheme, self.host)
        }
    }

    pub fn as_origin_string(&self) -> String {
        if let Some(port) = self.port {
            format!("{}://{}:{}", self.scheme, self.host, port)
        } else {
            format!("{}://{}", self.scheme, self.host)
        }
    }

    pub fn equals_ignore_default_port(&self, other: &ParsedOrigin) -> bool {
        let default_port_self = if self.scheme == "https" {
            DEFAULT_HTTPS_PORT
        } else {
            DEFAULT_HTTP_PORT
        };
        let default_port_other = if other.scheme == "https" {
            DEFAULT_HTTPS_PORT
        } else {
            DEFAULT_HTTP_PORT
        };

        let self_port = self.port.unwrap_or(default_port_self);
        let other_port = other.port.unwrap_or(default_port_other);

        self.scheme == other.scheme && self.host == other.host && self_port == other_port
    }
}

pub fn parse_origin(url: &Url) -> ParsedOrigin {
    ParsedOrigin::from_url(url)
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CatalogConfig {
    pub provider: String,
    pub url: Url,
    #[serde(skip_serializing)]
    pub username: String,
    #[serde(skip_serializing)]
    pub password: String,
    pub https_preferred: bool,
    pub trusted_lan: bool,
}

impl std::fmt::Debug for CatalogConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CatalogConfig")
            .field("provider", &self.provider)
            .field("url", &self.url)
            .field("username", &REDACTED)
            .field("password", &REDACTED)
            .field("https_preferred", &self.https_preferred)
            .field("trusted_lan", &self.trusted_lan)
            .finish()
    }
}

const REDACTED: &str = "***";

impl CatalogConfig {
    pub fn new(
        provider: impl Into<String>,
        url: Url,
        username: impl Into<String>,
        password: String,
    ) -> Result<Self, OpdsTransportError> {
        if !url.username().is_empty() {
            return Err(OpdsTransportError::CredentialInUrl);
        }

        if url.scheme() != "http" && url.scheme() != "https" {
            return Err(OpdsTransportError::InvalidUrl(
                "URL must use HTTP or HTTPS".to_string(),
            ));
        }

        Ok(CatalogConfig {
            provider: provider.into(),
            url,
            username: username.into(),
            password,
            https_preferred: true,
            trusted_lan: false,
        })
    }

    pub fn with_lan_trust(mut self) -> Self {
        self.trusted_lan = true;
        self
    }

    pub fn origin(&self) -> String {
        let parsed = ParsedOrigin::from_url(&self.url);
        parsed.as_origin_string()
    }

    pub fn base_url(&self) -> String {
        self.url.as_str().trim_end_matches('/').to_string() + "/"
    }

    pub fn catalog_url(&self) -> String {
        self.url.as_str().to_string()
    }

    pub fn pagination_url(&self, page: u32, size: u32) -> Option<String> {
        let size = size.clamp(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        let page = if page == 0 { 1 } else { page };

        let mut url = self.url.clone();
        let path = url.path().trim_end_matches('/').to_string();
        url.set_path(&path);

        let mut query_parts: Vec<String> = Vec::new();
        let mut had_page = false;
        let mut had_size = false;

        if let Some(old_query) = url.query() {
            for part in old_query.split('&') {
                if let Some((key, _)) = part.split_once('=') {
                    match key {
                        "page" => {
                            query_parts.push(format!("page={}", page));
                            had_page = true;
                        }
                        "size" => {
                            query_parts.push(format!("size={}", size));
                            had_size = true;
                        }
                        _ => query_parts.push(part.to_string()),
                    }
                } else {
                    query_parts.push(part.to_string());
                }
            }
        }

        if !had_page {
            query_parts.push(format!("page={}", page));
        }
        if !had_size {
            query_parts.push(format!("size={}", size));
        }

        url.set_query(Some(&query_parts.join("&")));
        Some(url.to_string())
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedUrl {
    pub url: Url,
    pub origin: String,
}

pub fn resolve_link(base: &Url, href: &str) -> Result<ResolvedUrl, OpdsTransportError> {
    let href_lower = href.to_lowercase();

    if href_lower.starts_with("data:")
        || href_lower.starts_with("javascript:")
        || href_lower.starts_with("vbscript:")
    {
        return Err(OpdsTransportError::InvalidUrl(
            "Unsupported scheme in href".to_string(),
        ));
    }

    if href.starts_with("mailto:") || href.starts_with("tel:") || href.starts_with("file:") {
        return Err(OpdsTransportError::InvalidUrl(
            "External link scheme not allowed".to_string(),
        ));
    }

    if href.contains("://")
        && href
            .split("://")
            .next()
            .map(|s| s != "http" && s != "https")
            .unwrap_or(false)
    {
        let lower_scheme = href_lower.split("://").next().unwrap_or("");
        if lower_scheme == "data" || lower_scheme == "javascript" || lower_scheme == "vbscript" {
            return Err(OpdsTransportError::InvalidUrl(
                "Unsupported scheme in href".to_string(),
            ));
        }
    }

    if href.contains("://") {
        let url = Url::parse(href)
            .map_err(|_| OpdsTransportError::InvalidUrl("Failed to resolve URL".to_string()))?;

        if !url.username().is_empty() || url.password().is_some() {
            return Err(OpdsTransportError::CredentialInUrl);
        }

        let parsed = ParsedOrigin::from_url(&url);
        let base_parsed = ParsedOrigin::from_url(base);
        if !parsed.equals_ignore_default_port(&base_parsed) {
            return Err(OpdsTransportError::InvalidRedirect);
        }

        return Ok(ResolvedUrl {
            url,
            origin: parsed.as_origin_string(),
        });
    }

    let url = if href.starts_with('/') {
        let host = base
            .host_str()
            .ok_or_else(|| OpdsTransportError::InvalidUrl("Base URL has no host".to_string()))?;
        let scheme = base.scheme();
        let port = base.port();
        let url_str = if let Some(p) = port {
            format!("{}://{}:{}{}", scheme, host, p, href)
        } else {
            format!("{}://{}{}", scheme, host, href)
        };
        Url::parse(&url_str)
            .map_err(|_| OpdsTransportError::InvalidUrl("Failed to resolve URL".to_string()))?
    } else if href.starts_with("//") {
        let scheme = base.scheme();
        Url::parse(&format!("{}:{}", scheme, href))
            .map_err(|_| OpdsTransportError::InvalidUrl("Failed to resolve URL".to_string()))?
    } else {
        base.join(href)
            .map_err(|_| OpdsTransportError::InvalidUrl("Failed to resolve URL".to_string()))?
    };

    if !url.username().is_empty() || url.password().is_some() {
        return Err(OpdsTransportError::CredentialInUrl);
    }

    let parsed = ParsedOrigin::from_url(&url);
    Ok(ResolvedUrl {
        url,
        origin: parsed.as_origin_string(),
    })
}

pub fn is_safe_origin(origin: &str, allowed_origins: &[String]) -> bool {
    allowed_origins.iter().any(|o| origin == o)
}

pub fn is_local_address(addr: &str) -> bool {
    addr == "localhost"
        || addr == "127.0.0.1"
        || addr == "::1"
        || addr.ends_with(".localhost")
        || addr.starts_with("127.")
        || addr.starts_with("169.254.")
        || {
            let parsed = addr.parse::<std::net::IpAddr>();
            if let Ok(std::net::IpAddr::V4(v4)) = parsed {
                v4.is_loopback()
            } else {
                false
            }
        }
}

pub fn validate_url_scheme(url: &Url) -> Result<(), OpdsTransportError> {
    match url.scheme() {
        "http" | "https" => Ok(()),
        _ => Err(OpdsTransportError::InvalidUrl(
            "URL must use HTTP or HTTPS".to_string(),
        )),
    }
}

pub fn validate_same_origin(url: &Url, expected_origin: &str) -> Result<(), OpdsTransportError> {
    let actual = ParsedOrigin::from_url(url);
    let expected = ParsedOrigin::from_origin_str(expected_origin);
    if actual.equals_ignore_default_port(&expected) {
        Ok(())
    } else {
        Err(OpdsTransportError::InvalidRedirect)
    }
}

pub fn origin_matches(url: &Url, expected_origin: &str) -> bool {
    let actual = ParsedOrigin::from_url(url);
    let expected = ParsedOrigin::from_origin_str(expected_origin);
    actual.equals_ignore_default_port(&expected)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_catalog_config_valid_url() {
        let url = Url::parse("https://example.com/opds").unwrap();
        let config = CatalogConfig::new("grimmory", url, "user", "pass".to_string());
        assert!(config.is_ok());
    }

    #[test]
    fn test_catalog_config_url_with_credentials() {
        let url = Url::parse("https://user:pass@example.com/opds").unwrap();
        let config = CatalogConfig::new("grimmory", url, "user", "pass".to_string());
        assert!(matches!(config, Err(OpdsTransportError::CredentialInUrl)));
    }

    #[test]
    fn test_catalog_config_invalid_scheme() {
        let url = Url::parse("ftp://example.com/opds").unwrap();
        let config = CatalogConfig::new("grimmory", url, "user", "pass".to_string());
        assert!(matches!(config, Err(OpdsTransportError::InvalidUrl(_))));
    }

    #[test]
    fn test_resolve_link_relative_with_port() {
        let base = Url::parse("https://example.com:8080/opds/catalog").unwrap();
        let resolved = resolve_link(&base, "/api/books");
        assert!(resolved.is_ok());
        let r = resolved.unwrap();
        assert_eq!(r.url.as_str(), "https://example.com:8080/api/books");
        assert_eq!(r.origin, "https://example.com:8080");
    }

    #[test]
    fn test_resolve_link_relative_default_port() {
        let base = Url::parse("https://example.com/opds/catalog").unwrap();
        let resolved = resolve_link(&base, "/api/books");
        assert!(resolved.is_ok());
        let r = resolved.unwrap();
        assert_eq!(r.url.as_str(), "https://example.com/api/books");
        assert_eq!(r.origin, "https://example.com");
    }

    #[test]
    fn test_resolve_link_http_default_port() {
        let base = Url::parse("http://example.com/opds").unwrap();
        let resolved = resolve_link(&base, "/api/books");
        assert!(resolved.is_ok());
        let r = resolved.unwrap();
        assert_eq!(r.url.as_str(), "http://example.com/api/books");
        assert_eq!(r.origin, "http://example.com");
    }

    #[test]
    fn test_resolve_link_absolute() {
        let base = Url::parse("https://example.com/opds").unwrap();
        let resolved = resolve_link(&base, "https://example.com/opds/next");
        assert!(resolved.is_ok());
        let r = resolved.unwrap();
        assert_eq!(r.url.as_str(), "https://example.com/opds/next");
    }

    #[test]
    fn test_resolve_link_javascript_rejected() {
        let base = Url::parse("https://example.com/opds").unwrap();
        let resolved = resolve_link(&base, "javascript:alert(1)");
        assert!(resolved.is_err());
    }

    #[test]
    fn test_resolve_link_data_rejected() {
        let base = Url::parse("https://example.com/opds").unwrap();
        let resolved = resolve_link(&base, "data:text/html,<script>alert(1)</script>");
        assert!(resolved.is_err());
    }

    #[test]
    fn test_resolve_link_mailto_rejected() {
        let base = Url::parse("https://example.com/opds").unwrap();
        let resolved = resolve_link(&base, "mailto:admin@example.com");
        assert!(resolved.is_err());
    }

    #[test]
    fn test_resolve_link_credential_in_url() {
        let base = Url::parse("https://example.com/opds").unwrap();
        let resolved = resolve_link(&base, "https://user:pass@example.com/opds");
        assert!(matches!(resolved, Err(OpdsTransportError::CredentialInUrl)));
    }

    #[test]
    fn test_validate_url_scheme_http() {
        let url = Url::parse("http://example.com/").unwrap();
        assert!(validate_url_scheme(&url).is_ok());
    }

    #[test]
    fn test_validate_url_scheme_https() {
        let url = Url::parse("https://example.com/").unwrap();
        assert!(validate_url_scheme(&url).is_ok());
    }

    #[test]
    fn test_validate_same_origin_match() {
        let url = Url::parse("https://example.com/books").unwrap();
        assert!(validate_same_origin(&url, "https://example.com").is_ok());
    }

    #[test]
    fn test_validate_same_origin_mismatch() {
        let url = Url::parse("https://other.com/books").unwrap();
        assert!(matches!(
            validate_same_origin(&url, "https://example.com"),
            Err(OpdsTransportError::InvalidRedirect)
        ));
    }

    #[test]
    fn test_is_local_address() {
        assert!(is_local_address("localhost"));
        assert!(is_local_address("127.0.0.1"));
        assert!(is_local_address("127.0.0.42"));
        assert!(!is_local_address("example.com"));
    }

    #[test]
    fn test_catalog_config_origin() {
        let url = Url::parse("https://example.com:8080/opds").unwrap();
        let config = CatalogConfig::new("grimmory", url, "user", "pass".to_string()).unwrap();
        assert_eq!(config.origin(), "https://example.com:8080");
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

    #[test]
    fn test_parse_origin_default_port() {
        let url = Url::parse("https://example.com/opds").unwrap();
        let parsed = ParsedOrigin::from_url(&url);
        assert_eq!(parsed.scheme, "https");
        assert_eq!(parsed.host, "example.com");
        assert_eq!(parsed.port, None);
    }

    #[test]
    fn test_parse_origin_explicit_port() {
        let url = Url::parse("https://example.com:8443/opds").unwrap();
        let parsed = ParsedOrigin::from_url(&url);
        assert_eq!(parsed.scheme, "https");
        assert_eq!(parsed.host, "example.com");
        assert_eq!(parsed.port, Some(8443));
    }

    #[test]
    fn test_parse_origin_ipv6() {
        let url = Url::parse("http://[::1]:8080/opds").unwrap();
        let parsed = ParsedOrigin::from_url(&url);
        assert_eq!(parsed.scheme, "http");
        assert_eq!(parsed.host, "[::1]");
        assert_eq!(parsed.port, Some(8080));
    }

    #[test]
    fn test_origin_matches_default_port() {
        let url1 = Url::parse("https://example.com/opds").unwrap();
        let url2 = Url::parse("https://example.com:443/opds").unwrap();
        assert!(origin_matches(&url1, "https://example.com"));
        assert!(origin_matches(&url2, "https://example.com"));
    }

    #[test]
    fn test_origin_matches_http_default_port() {
        let url1 = Url::parse("http://example.com/opds").unwrap();
        let url2 = Url::parse("http://example.com:80/opds").unwrap();
        assert!(origin_matches(&url1, "http://example.com"));
        assert!(origin_matches(&url2, "http://example.com"));
    }

    #[test]
    fn test_debug_output_redacts_credentials() {
        let url = Url::parse("https://example.com/opds").unwrap();
        let config =
            CatalogConfig::new("grimmory", url, "alice", "s3cret-password".to_string()).unwrap();

        let debug = format!("{config:?}");
        assert!(
            !debug.contains("s3cret-password"),
            "password leaked in debug: {debug}"
        );
        assert!(
            !debug.contains("alice"),
            "username leaked in debug: {debug}"
        );
        assert!(debug.contains("***"));

        // Serialize output must not carry credentials either.
        let json = serde_json::to_string(&config).unwrap();
        assert!(
            !json.contains("s3cret-password"),
            "password leaked in json: {json}"
        );
        assert!(
            !json.contains("\"alice\""),
            "username leaked in json: {json}"
        );

        // The host stays available for diagnostics.
        assert!(format!("{config:?}").contains("example.com"));
    }
}
