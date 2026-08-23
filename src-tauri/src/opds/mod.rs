use serde::{Deserialize, Serialize};
use std::collections::HashMap;

mod acquisition;
mod downloader;
mod errors;
mod http_client;
mod http_client_tests;
mod install;
mod parser;
mod transport;

pub use acquisition::{
    derive_filename, is_valid_media_type, plan_download_destination, select_acquisition,
    validate_download_url, DownloadPlan, MEDIA_TYPE_EPUB, MEDIA_TYPE_PDF,
};
pub use downloader::{
    download_file, DownloadContext, DEFAULT_DOWNLOAD_TIMEOUT_SECS, DEFAULT_MAX_DOWNLOAD_SIZE,
};
pub use errors::{AcquisitionError, DownloadError, OpdsTransportError};
pub use http_client::{ClientPagination, OpdsClient};
pub use install::{
    download_verified_epub, safe_join, safe_remove_within_root, sha256_file, validate_epub_zip,
    InstallError, InstalledDownload, VerifiedEpubRequest, DEFAULT_MAX_ATTEMPTS,
};
pub use parser::parse_catalog;
pub use parser::parse_catalog_from_str;
pub use transport::{
    is_local_address, is_safe_origin, origin_matches, parse_origin, resolve_link,
    validate_same_origin, validate_url_scheme, CatalogConfig, ParsedOrigin, ResolvedUrl,
    DEFAULT_HTTPS_PORT, DEFAULT_HTTP_PORT, DEFAULT_PAGE_SIZE, MAX_FEED_SIZE, MAX_PAGE_SIZE,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Catalog {
    pub title: String,
    pub updated: Option<String>,
    pub authors: Vec<String>,
    pub links: Vec<NavigationLink>,
    pub publications: Vec<Publication>,
    pub pagination: Option<Pagination>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NavigationLink {
    pub href: String,
    pub rel: Option<String>,
    pub title: Option<String>,
    pub r#type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Publication {
    pub id: String,
    pub updated: Option<String>,
    pub title: String,
    pub authors: Vec<String>,
    pub pubdate: Option<String>,
    pub identifiers: HashMap<String, String>,
    pub series: Option<Series>,
    pub languages: Vec<String>,
    pub relations: Vec<Relation>,
    pub descriptions: Vec<String>,
    pub links: Vec<Acquisition>,
    pub providers: Option<Vec<String>>,
    pub representative: Option<RepresentativeLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Series {
    pub name: String,
    pub index: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relation {
    pub rel: String,
    pub href: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Acquisition {
    pub href: String,
    pub r#type: Option<String>,
    pub media_type: Option<String>,
    pub cost: Option<AcquisitionCost>,
    pub rel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcquisitionCost {
    pub price: Option<f64>,
    pub currency: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepresentativeLink {
    pub href: String,
    pub r#type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pagination {
    pub page: u32,
    pub size: u32,
    pub total: Option<u32>,
    pub next: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderId {
    pub provider: String,
    pub identifier: String,
}

impl ProviderId {
    pub fn new(provider: impl Into<String>, identifier: impl Into<String>) -> Self {
        ProviderId {
            provider: provider.into(),
            identifier: identifier.into(),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum OpdsError {
    #[error("Missing required element: {0}")]
    MissingRequired(&'static str),

    #[error("Invalid XML: {0}")]
    InvalidXml(String),

    #[error("Missing required attribute: {0}")]
    MissingAttribute(&'static str),

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("Empty publication ID")]
    EmptyPublicationId,

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Authentication required")]
    AuthenticationRequired,

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Feed too large: {0} bytes")]
    FeedTooLarge(u64),

    #[error("Entity expansion not allowed")]
    EntityExpansionBlocked,
}

impl From<OpdsError> for String {
    fn from(err: OpdsError) -> Self {
        err.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_catalog_creation() {
        let catalog = Catalog {
            title: "Test Catalog".to_string(),
            updated: Some("2024-01-01T00:00:00Z".to_string()),
            authors: vec!["Test Author".to_string()],
            links: vec![NavigationLink {
                href: "/".to_string(),
                rel: Some("self".to_string()),
                title: Some("self".to_string()),
                r#type: Some("application/atom+xml".to_string()),
            }],
            publications: vec![],
            pagination: None,
        };
        assert_eq!(catalog.title, "Test Catalog");
        assert_eq!(catalog.authors.len(), 1);
    }

    #[test]
    fn test_publication_with_acquisitions() {
        let publ = Publication {
            id: "book-123".to_string(),
            updated: None,
            title: "Test Book".to_string(),
            authors: vec!["Author One".to_string(), "Author Two".to_string()],
            pubdate: Some("2024-01-01".to_string()),
            identifiers: HashMap::from([
                ("isbn".to_string(), "978-1234567890".to_string()),
                ("grimmory".to_string(), "42".to_string()),
            ]),
            series: Some(Series {
                name: "Test Series".to_string(),
                index: Some(1.0),
            }),
            languages: vec!["en".to_string()],
            relations: vec![],
            descriptions: vec!["A test description".to_string()],
            links: vec![
                Acquisition {
                    href: "/download/book-123.epub".to_string(),
                    r#type: None,
                    media_type: Some("application/epub+zip".to_string()),
                    cost: None,
                    rel: Some("acquisition".to_string()),
                },
                Acquisition {
                    href: "/download/book-123.pdf".to_string(),
                    r#type: None,
                    media_type: Some("application/pdf".to_string()),
                    cost: None,
                    rel: Some("acquisition".to_string()),
                },
            ],
            providers: None,
            representative: None,
        };
        assert_eq!(publ.title, "Test Book");
        assert_eq!(publ.links.len(), 2);
        assert!(publ.identifiers.contains_key("grimmory"));
    }

    #[test]
    fn test_provider_id() {
        let id = ProviderId::new("grimmory", "42");
        assert_eq!(id.provider, "grimmory");
        assert_eq!(id.identifier, "42");
    }

    #[test]
    fn test_pagination() {
        let pagination = Pagination {
            page: 2,
            size: 50,
            total: Some(150),
            next: Some("/catalog?page=3".to_string()),
        };
        assert_eq!(pagination.page, 2);
        assert_eq!(pagination.size, 50);
    }

    #[test]
    fn test_acquisition_cost() {
        let cost = AcquisitionCost {
            price: Some(14.99),
            currency: Some("USD".to_string()),
            description: Some("Purchase".to_string()),
        };
        assert_eq!(cost.price, Some(14.99));
    }

    #[test]
    fn test_opds_error_display() {
        let err = OpdsError::MissingRequired("title");
        assert!(err.to_string().contains("title"));
    }
}
