use crate::opds::errors::{AcquisitionError, OpdsTransportError};
use crate::opds::{Acquisition, Publication};
use std::path::{Path, PathBuf};
use url::Url;

pub const MEDIA_TYPE_EPUB: &str = "application/epub+zip";
pub const MEDIA_TYPE_PDF: &str = "application/pdf";

pub fn select_acquisition(acquisitions: &[Acquisition]) -> Option<&Acquisition> {
    if acquisitions.is_empty() {
        return None;
    }

    let epub = acquisitions
        .iter()
        .find(|acq| matches!(acq.media_type.as_deref(), Some(MEDIA_TYPE_EPUB)));

    if let Some(acq) = epub {
        return Some(acq);
    }

    acquisitions
        .iter()
        .find(|acq| matches!(acq.media_type.as_deref(), Some(MEDIA_TYPE_PDF)))
}

pub fn is_valid_media_type(media_type: Option<&str>) -> bool {
    matches!(media_type, Some(MEDIA_TYPE_EPUB) | Some(MEDIA_TYPE_PDF))
}

pub fn validate_download_url(
    href: &str,
    catalog_origin: &str,
    base_url: &Url,
) -> Result<Url, OpdsTransportError> {
    if href.is_empty() {
        return Err(OpdsTransportError::MissingAcquisitionUrl);
    }

    let resolved = crate::opds::transport::resolve_link(base_url, href).map_err(|e| {
        if matches!(e, OpdsTransportError::InvalidRedirect) {
            OpdsTransportError::CrossOriginAcquisitionUrl(catalog_origin.to_string())
        } else {
            e
        }
    })?;

    if !resolved.url.username().is_empty() {
        return Err(OpdsTransportError::CredentialInUrl);
    }

    Ok(resolved.url)
}

pub fn derive_filename(title: &str, media_type: &str) -> String {
    let extension = media_type_to_extension(media_type);

    let sanitized_title = sanitize_title(title);

    format!("{}.{}", sanitized_title, extension)
}

fn media_type_to_extension(media_type: &str) -> String {
    if media_type == MEDIA_TYPE_EPUB {
        "epub".to_string()
    } else if media_type == MEDIA_TYPE_PDF {
        "pdf".to_string()
    } else {
        media_type
            .strip_prefix("application/")
            .unwrap_or(media_type)
            .trim_start_matches('+')
            .replace('+', "-")
            .to_string()
    }
}

fn sanitize_title(title: &str) -> String {
    let sanitized: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c
            } else if c == ' ' || c == '-' || c == '_' {
                '_'
            } else {
                '_'
            }
        })
        .collect();

    let sanitized = sanitized.replace("_", "_").replace("__", "_");
    let sanitized = sanitized.trim_matches('_').to_string();

    if sanitized.is_empty() {
        "publication".to_string()
    } else {
        sanitized
    }
}

pub fn plan_download_destination(
    content_root: &Path,
    publication: &Publication,
    catalog_origin: &str,
    base_url: &Url,
) -> Result<DownloadPlan, AcquisitionError> {
    if content_root.as_os_str().is_empty() {
        return Err(AcquisitionError::MissingContentRoot);
    }

    let acquisition =
        select_acquisition(&publication.links).ok_or(AcquisitionError::NoSupportedAcquisition)?;

    let resolved_url = validate_download_url(&acquisition.href, catalog_origin, base_url).map_err(
        |e| match e {
            OpdsTransportError::MissingAcquisitionUrl => AcquisitionError::NoSupportedAcquisition,
            OpdsTransportError::CrossOriginAcquisitionUrl(_) => {
                AcquisitionError::PathEscaped("cross-origin".to_string())
            }
            OpdsTransportError::CredentialInUrl => {
                AcquisitionError::PathEscaped("credential-bearing".to_string())
            }
            OpdsTransportError::InvalidUrl(msg) => AcquisitionError::PathEscaped(msg),
            _ => AcquisitionError::PathEscaped("invalid".to_string()),
        },
    )?;

    let media_type = acquisition.media_type.as_deref().unwrap_or(MEDIA_TYPE_EPUB);
    let filename = derive_filename(&publication.title, media_type);

    let dest_path = content_root.join(&filename);
    if !is_path_contained(content_root, &dest_path)? {
        return Err(AcquisitionError::PathEscaped(
            dest_path.to_string_lossy().to_string(),
        ));
    }

    Ok(DownloadPlan {
        url: resolved_url,
        destination: PathBuf::from(&filename),
        filename,
        media_type: media_type.to_string(),
    })
}

pub fn is_path_contained(root: &Path, target: &Path) -> Result<bool, AcquisitionError> {
    let canonical_root = std::fs::canonicalize(root).map_err(|_| {
        AcquisitionError::InvalidContentRoot(format!("Cannot canonicalize root: {:?}", root))
    })?;

    let root_str = canonical_root.to_string_lossy();
    let target_str = target.to_string_lossy();

    if target_str.starts_with(&*root_str) || target.starts_with(&canonical_root) {
        for component in target.components() {
            if let std::path::Component::ParentDir = component {
                return Ok(false);
            }
        }
        Ok(true)
    } else {
        Ok(false)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadPlan {
    pub url: Url,
    pub destination: PathBuf,
    pub filename: String,
    pub media_type: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::opds::{Acquisition, CatalogConfig, Publication};
    use std::collections::HashMap;
    use url::Url;

    fn make_acquisition(href: &str, media_type: &str) -> Acquisition {
        Acquisition {
            href: href.to_string(),
            r#type: Some(media_type.to_string()),
            media_type: Some(media_type.to_string()),
            cost: None,
            rel: Some("acquisition".to_string()),
        }
    }

    fn make_publication(title: &str, acquisitions: Vec<Acquisition>) -> Publication {
        Publication {
            id: format!("book-{}", title.replace(' ', "-")),
            updated: None,
            title: title.to_string(),
            authors: vec![],
            pubdate: None,
            publisher: None,
            categories: Vec::new(),
            identifiers: HashMap::new(),
            series: None,
            languages: vec![],
            relations: vec![],
            descriptions: vec![],
            links: acquisitions,
            providers: None,
            representative: None,
        }
    }

    fn make_catalog_config(url: &str) -> CatalogConfig {
        CatalogConfig::new("test", Url::parse(url).unwrap(), "user", "pass".to_string()).unwrap()
    }

    #[test]
    fn test_select_acquisition_epub_first() {
        let acqs = vec![
            make_acquisition("/download/book.pdf", MEDIA_TYPE_PDF),
            make_acquisition("/download/book.epub", MEDIA_TYPE_EPUB),
        ];
        let selected = select_acquisition(&acqs);
        assert!(selected.is_some());
        assert_eq!(
            selected.unwrap().media_type,
            Some(MEDIA_TYPE_EPUB.to_string())
        );
    }

    #[test]
    fn test_select_acquisition_pdf() {
        let acqs = vec![make_acquisition("/download/book.pdf", MEDIA_TYPE_PDF)];
        let selected = select_acquisition(&acqs);
        assert!(selected.is_some());
        assert_eq!(
            selected.unwrap().media_type,
            Some(MEDIA_TYPE_PDF.to_string())
        );
    }

    #[test]
    fn test_select_acquisition_unsupported_type() {
        let acqs = vec![make_acquisition(
            "/download/book.mobi",
            "application/x-mobipocket-ebook",
        )];
        let selected = select_acquisition(&acqs);
        assert!(selected.is_none());
    }

    #[test]
    fn test_select_acquisition_empty_list() {
        let acqs: Vec<Acquisition> = vec![];
        let selected = select_acquisition(&acqs);
        assert!(selected.is_none());
    }

    #[test]
    fn test_select_acquisition_no_media_type() {
        let acq = Acquisition {
            href: "/download/book".to_string(),
            r#type: None,
            media_type: None,
            cost: None,
            rel: Some("acquisition".to_string()),
        };
        let acqs = vec![acq];
        let selected = select_acquisition(&acqs);
        assert!(selected.is_none());
    }

    #[test]
    fn test_is_valid_media_type_epub() {
        assert!(is_valid_media_type(Some(MEDIA_TYPE_EPUB)));
    }

    #[test]
    fn test_is_valid_media_type_pdf() {
        assert!(is_valid_media_type(Some(MEDIA_TYPE_PDF)));
    }

    #[test]
    fn test_is_valid_media_type_unsupported() {
        assert!(!is_valid_media_type(Some("application/pdf;other")));
        assert!(!is_valid_media_type(Some("application/x-mobipocket-ebook")));
        assert!(!is_valid_media_type(None));
    }

    #[test]
    fn test_derive_filename_epub() {
        let name = derive_filename("The Way of Kings", MEDIA_TYPE_EPUB);
        assert_eq!(name, "The_Way_of_Kings.epub");
    }

    #[test]
    fn test_derive_filename_pdf() {
        let name = derive_filename("Test Book", MEDIA_TYPE_PDF);
        assert_eq!(name, "Test_Book.pdf");
    }

    #[test]
    fn test_derive_filename_sanitizes_special_chars() {
        let name = derive_filename("Book: A Guide? <Test>", MEDIA_TYPE_EPUB);
        assert!(!name.contains(':'));
        assert!(!name.contains('?'));
        assert!(!name.contains('<'));
        assert!(!name.contains('>'));
        assert!(name.ends_with(".epub"));
    }

    #[test]
    fn test_derive_filename_trailing_spaces() {
        let name = derive_filename("  Test Book  ", MEDIA_TYPE_EPUB);
        assert!(!name.starts_with('.'));
    }

    #[test]
    fn test_derive_filename_empty() {
        let name = derive_filename("", MEDIA_TYPE_EPUB);
        assert_eq!(name, "publication.epub");
    }

    #[test]
    fn test_derive_filename_only_special_chars() {
        let name = derive_filename("<>:\"/\\|?*", MEDIA_TYPE_EPUB);
        assert_eq!(name, "publication.epub");
    }

    #[test]
    fn test_validate_download_url_missing() {
        let config = make_catalog_config("https://example.com/opds");
        let result = validate_download_url("", &config.origin(), &config.url);
        assert!(matches!(
            result,
            Err(OpdsTransportError::MissingAcquisitionUrl)
        ));
    }

    #[test]
    fn test_validate_download_url_valid_relative() {
        let config = make_catalog_config("https://example.com/opds");
        let result = validate_download_url("/download/book.epub", &config.origin(), &config.url);
        assert!(result.is_ok());
        let url = result.unwrap();
        assert!(url
            .as_str()
            .starts_with("https://example.com/download/book.epub"));
    }

    #[test]
    fn test_validate_download_url_valid_absolute() {
        let config = make_catalog_config("https://example.com/opds");
        let result = validate_download_url(
            "https://example.com/opds/book.epub",
            &config.origin(),
            &config.url,
        );
        assert!(result.is_ok());
        let url = result.unwrap();
        assert_eq!(url.as_str(), "https://example.com/opds/book.epub");
    }

    #[test]
    fn test_validate_download_url_cross_origin() {
        let config = make_catalog_config("https://example.com/opds");
        let result =
            validate_download_url("https://evil.com/book.epub", &config.origin(), &config.url);
        assert!(matches!(
            result,
            Err(OpdsTransportError::CrossOriginAcquisitionUrl(_))
        ));
    }

    #[test]
    fn test_validate_download_url_credential_in_url() {
        let config = make_catalog_config("https://example.com/opds");
        let result = validate_download_url(
            "https://user:pass@example.com/book.epub",
            &config.origin(),
            &config.url,
        );
        assert!(matches!(result, Err(OpdsTransportError::CredentialInUrl)));
    }

    #[test]
    fn test_unsafe_schemes_rejected() {
        let config = make_catalog_config("https://example.com/opds");

        assert!(
            validate_download_url("javascript:alert(1)", &config.origin(), &config.url).is_err()
        );
        assert!(
            validate_download_url("data:text/html,test", &config.origin(), &config.url).is_err()
        );
    }

    #[test]
    fn test_validate_download_url_mailto_rejected() {
        let config = make_catalog_config("https://example.com/opds");
        let result =
            validate_download_url("mailto:test@example.com", &config.origin(), &config.url);
        assert!(result.is_err());
    }

    #[test]
    fn test_plan_download_destination_simple() {
        let config = make_catalog_config("https://example.com/opds");
        let publ = make_publication(
            "Test Book",
            vec![make_acquisition("/download/book.epub", MEDIA_TYPE_EPUB)],
        );

        let content_root = std::env::temp_dir().join("shelfsync_download_test");
        let _ = std::fs::create_dir_all(&content_root);

        let result = plan_download_destination(&content_root, &publ, &config.origin(), &config.url);

        assert!(result.is_ok());
        let plan = result.unwrap();
        assert!(plan.destination.ends_with("Test_Book.epub"));
        assert_eq!(plan.media_type, MEDIA_TYPE_EPUB);

        let _ = std::fs::remove_dir_all(&content_root);
    }

    #[test]
    fn test_plan_download_destination_pdf() {
        let config = make_catalog_config("https://example.com/opds");
        let publ = make_publication(
            "Test PDF",
            vec![make_acquisition("/download/book.pdf", MEDIA_TYPE_PDF)],
        );

        let content_root = std::env::temp_dir().join("shelfsync_download_test_pdf");
        let _ = std::fs::create_dir_all(&content_root);

        let result = plan_download_destination(&content_root, &publ, &config.origin(), &config.url);

        assert!(result.is_ok());
        let plan = result.unwrap();
        assert!(plan.filename.ends_with(".pdf"));

        let _ = std::fs::remove_dir_all(&content_root);
    }

    #[test]
    fn test_plan_download_destination_no_acquisitions() {
        let config = make_catalog_config("https://example.com/opds");
        let publ = make_publication("Test Book", vec![]);

        let content_root = std::env::temp_dir().join("shelfsync_download_test_empty");

        let result = plan_download_destination(&content_root, &publ, &config.origin(), &config.url);

        assert!(matches!(
            result,
            Err(AcquisitionError::NoSupportedAcquisition)
        ));
    }

    #[test]
    fn test_plan_download_destination_unsupported_only() {
        let config = make_catalog_config("https://example.com/opds");
        let publ = make_publication(
            "Test Book",
            vec![make_acquisition(
                "/download/book.mobi",
                "application/x-mobipocket-ebook",
            )],
        );

        let content_root = std::env::temp_dir().join("shelfsync_download_test_unsupported");

        let result = plan_download_destination(&content_root, &publ, &config.origin(), &config.url);

        assert!(matches!(
            result,
            Err(AcquisitionError::NoSupportedAcquisition)
        ));
    }

    #[test]
    fn test_plan_download_destination_cross_origin() {
        let config = make_catalog_config("https://example.com/opds");
        let publ = make_publication(
            "Test Book",
            vec![make_acquisition(
                "https://evil.com/book.epub",
                MEDIA_TYPE_EPUB,
            )],
        );

        let content_root = std::env::temp_dir().join("shelfsync_download_test_cross");

        let result = plan_download_destination(&content_root, &publ, &config.origin(), &config.url);

        assert!(matches!(result, Err(AcquisitionError::PathEscaped(_))));
    }

    #[test]
    fn test_plan_download_destination_traversal_title() {
        let config = make_catalog_config("https://example.com/opds");
        let publ = make_publication(
            "../../../etc/passwd",
            vec![make_acquisition("/download/book.epub", MEDIA_TYPE_EPUB)],
        );

        let content_root = std::env::temp_dir().join("shelfsync_download_test_trav");
        let _ = std::fs::create_dir_all(&content_root);

        let result = plan_download_destination(&content_root, &publ, &config.origin(), &config.url);

        assert!(result.is_ok());
        let plan = result.unwrap();
        assert!(!plan.destination.to_string_lossy().contains("../"));

        let _ = std::fs::remove_dir_all(&content_root);
    }

    #[test]
    fn test_is_path_contained_valid() {
        let root = std::env::temp_dir().join("shelfsync_test_content_valid");
        let _ = std::fs::create_dir_all(&root);

        let target = root.join("book.epub");
        std::fs::write(&target, "test content").ok();

        let result = is_path_contained(&root, &target);
        assert!(result.is_ok());
        assert!(result.unwrap());

        let _ = std::fs::remove_file(&target);
        let _ = std::fs::remove_dir(&root);
    }

    #[test]
    fn test_is_path_contained_escape() {
        let root = std::env::temp_dir().join("shelfsync_test_content_escape");
        let _ = std::fs::create_dir_all(&root);

        let target = root.join("sub.txt");
        std::fs::write(&target, "test").ok();

        let escaped = root.parent().unwrap().join("escaped.epub");

        let result = is_path_contained(&root, &escaped);

        if let Ok(contained) = result {
            assert!(!contained);
        }

        let _ = std::fs::remove_file(&target);
        let _ = std::fs::remove_dir(&root);
    }

    #[test]
    fn test_plan_download_destination_no_content_root() {
        let config = make_catalog_config("https://example.com/opds");
        let publ = make_publication(
            "Test Book",
            vec![make_acquisition("/download/book.epub", MEDIA_TYPE_EPUB)],
        );

        let result = plan_download_destination(Path::new(""), &publ, &config.origin(), &config.url);

        assert!(matches!(result, Err(AcquisitionError::MissingContentRoot)));
    }

    #[test]
    fn test_deterministic_filename_same_title() {
        let name1 = derive_filename("Test Book", MEDIA_TYPE_EPUB);
        let name2 = derive_filename("Test Book", MEDIA_TYPE_EPUB);
        assert_eq!(name1, name2);
    }

    #[test]
    fn test_deterministic_filename_unicode_preserved() {
        let name = derive_filename("Café Résumé", MEDIA_TYPE_EPUB);
        assert!(name.contains("Café"));
        assert!(name.contains("Résumé"));
    }
}
