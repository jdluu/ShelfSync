use std::collections::HashSet;

use crate::opds::{
    MEDIA_TYPE_EPUB, MEDIA_TYPE_PDF, OpdsClient, Publication, origin_matches, resolve_link,
    validate_download_url,
};
use crate::persist::{AcquisitionInput, LibraryStore, PersistError};

/// Hard cap for pagination walks so a misbehaving server cannot loop forever.
pub const MAX_REFRESH_PAGES: usize = 25;

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct RefreshReport {
    pub added: Vec<String>,
    pub changed: Vec<String>,
    pub removed: Vec<String>,
    pub publications_seen: usize,
    pub pages_visited: usize,
    /// True when the walk stopped early (page cap). Availability marking is
    /// skipped so unvisited pages can never be flagged as server removed.
    pub truncated: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum RefreshError {
    #[error("catalog transport failed: {0}")]
    Transport(#[from] crate::opds::OpdsTransportError),
    #[error("persistence failed: {0}")]
    Persist(#[from] PersistError),
}

fn supported_media_type(media_type: Option<&str>) -> Option<&'static str> {
    match media_type? {
        MEDIA_TYPE_EPUB => Some(MEDIA_TYPE_EPUB),
        MEDIA_TYPE_PDF => Some(MEDIA_TYPE_PDF),
        _ => None,
    }
}

fn feed_acquisitions(
    publication: &Publication,
    base_url: &url::Url,
    catalog_origin: &str,
) -> Vec<(&'static str, url::Url)> {
    let mut out = Vec::new();
    for link in &publication.links {
        let Some(media_type) = supported_media_type(link.media_type.as_deref()) else {
            continue;
        };
        if let Ok(resolved) = validate_download_url(&link.href, catalog_origin, base_url) {
            out.push((media_type, resolved));
        }
    }
    out
}

async fn stored_acquisition_map(
    store: &LibraryStore,
    publication_id: i64,
) -> Result<std::collections::HashMap<String, String>, RefreshError> {
    let acquisitions = store.list_acquisitions(publication_id).await?;
    Ok(acquisitions
        .into_iter()
        .map(|a| (a.media_type, a.canonical_url))
        .collect())
}

fn acquisition_set_changed(
    existing: &std::collections::HashMap<String, String>,
    incoming: &[(&'static str, url::Url)],
) -> bool {
    if existing.len() != incoming.len() {
        return true;
    }
    incoming.iter().any(|(media_type, url)| {
        existing.get(*media_type) != Some(&url.as_str().to_string())
    })
}

/// Compares two metadata snapshots semantically. Stored snapshots are
/// normalized through serde_json (which sorts object keys), so string equality
/// would report false positives.
fn metadata_changed(stored: &str, incoming: &str) -> bool {
    match (
        serde_json::from_str::<serde_json::Value>(stored),
        serde_json::from_str::<serde_json::Value>(incoming),
    ) {
        (Ok(a), Ok(b)) => a != b,
        _ => stored != incoming,
    }
}

/// Reconciles one fetched catalog page against the persisted library.
///
/// Publications absent from the store are reported as added; publications whose
/// metadata snapshot or acquisition set changed are reported as changed. Every
/// seen publication becomes available again. Server removals are never decided
/// here: callers mark those only after the full catalog walk succeeded.
pub async fn reconcile_catalog_page(
    store: &LibraryStore,
    account_id: i64,
    provider: &str,
    base_url: &url::Url,
    catalog_origin: &str,
    publications: &[Publication],
    report: &mut RefreshReport,
) -> Result<(), RefreshError> {
    for publication in publications {
        report.publications_seen += 1;
        let metadata_json = serde_json::to_string(publication)
            .map_err(|e| PersistError::InvalidMetadata(e.to_string()))?;

        let existing = store
            .find_publication(account_id, provider.to_string(), publication.id.clone())
            .await?;
        let incoming = feed_acquisitions(publication, base_url, catalog_origin);

        let changed = match &existing {
            None => false,
            Some(current) => {
                metadata_changed(&current.metadata_json, &metadata_json)
                    || acquisition_set_changed(
                        &stored_acquisition_map(store, current.id).await?,
                        &incoming,
                    )
            }
        };

        let upsert = store
            .upsert_publication(crate::persist::PublicationInput {
                account_id,
                provider: provider.to_string(),
                canonical_id: publication.id.clone(),
                metadata_json,
            })
            .await?;
        if existing.is_none() {
            report.added.push(upsert.publication.canonical_id.clone());
        } else if changed {
            report.changed.push(upsert.publication.canonical_id.clone());
        }

        for (media_type, canonical_url) in incoming {
            store
                .upsert_acquisition(AcquisitionInput {
                    publication_id: upsert.publication.id,
                    media_type: media_type.to_string(),
                    canonical_url: canonical_url.as_str().to_string(),
                })
                .await?;
        }
    }
    Ok(())
}

/// Re-fetches the catalog and reconciles local records with the server.
///
/// New and changed publications are recorded, publications that vanished from
/// every page are marked unavailable. Local files are never touched: marking is
/// metadata only and explicit user action is required to delete content.
pub async fn refresh_library_metadata(
    store: &LibraryStore,
    client: &OpdsClient,
    provider: &str,
) -> Result<RefreshReport, RefreshError> {
    let account = store
        .ensure_catalog_account(
            provider.to_string(),
            client.base_url(),
            client.config().username.clone(),
        )
        .await?;

    let mut report = RefreshReport::default();
    let mut seen_ids: HashSet<String> = HashSet::new();
    let mut next_url: Option<url::Url> = Some(client.config().url.clone());
    let catalog_origin = client.origin();

    while let Some(page_url) = next_url {
        let catalog = client.fetch_feed(page_url.as_str()).await?;
        reconcile_catalog_page(
            store,
            account.id,
            provider,
            &page_url,
            &catalog_origin,
            &catalog.publications,
            &mut report,
        )
        .await?;
        for publication in &catalog.publications {
            seen_ids.insert(publication.id.clone());
        }
        report.pages_visited += 1;

        next_url = match catalog
            .links
            .iter()
            .find(|l| l.rel.as_deref() == Some("next"))
        {
            Some(next_link) => {
                let resolved = resolve_link(&page_url, &next_link.href)?;
                if !origin_matches(&resolved.url, &catalog_origin) {
                    None
                } else {
                    Some(resolved.url)
                }
            }
            None => None,
        };
        if next_url.is_some() && report.pages_visited >= MAX_REFRESH_PAGES {
            report.truncated = true;
            break;
        }
    }

    if !report.truncated {
        for publication in store.list_publications_for_account(account.id).await? {
            if publication.available && !seen_ids.contains(&publication.canonical_id) {
                store
                    .set_publication_available(publication.id, false)
                    .await?;
                report.removed.push(publication.canonical_id);
            }
        }
    }

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::opds::{Acquisition, CatalogConfig, OpdsClient, MEDIA_TYPE_EPUB};
    use crate::persist::JobState;
    use axum::body::Body;
    use axum::http::StatusCode;
    use axum::routing::get;
    use axum::Router;
    use axum_test::TestServer;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tempfile::tempdir;
    use url::Url;

    fn publication(id: &str, title: &str) -> Publication {
        Publication {
            id: id.to_string(),
            updated: Some("2026-01-01T00:00:00Z".to_string()),
            title: title.to_string(),
            authors: vec![],
            pubdate: None,
            identifiers: Default::default(),
            series: None,
            languages: vec![],
            relations: vec![],
            descriptions: vec![],
            links: vec![Acquisition {
                href: format!("/download/{id}.epub"),
                r#type: Some(MEDIA_TYPE_EPUB.to_string()),
                media_type: Some(MEDIA_TYPE_EPUB.to_string()),
                cost: None,
                rel: Some("acquisition".to_string()),
            }],
            providers: None,
            representative: None,
        }
    }

    fn feed_for(title: &str, publications: &[Publication], next_href: Option<&str>) -> String {
        let mut xml = format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
             <feed xmlns=\"http://www.w3.org/2005/Atom\">\n  \
             <id>urn:uuid:{title}</id>\n  <title>{title}</title>\n  \
             <updated>2026-01-01T00:00:00Z</updated>\n"
        );
        if let Some(href) = next_href {
            xml.push_str(&format!(
                "  <link rel=\"next\" type=\"application/atom+xml\" href=\"{href}\"/>\n"
            ));
        }
        for p in publications {
            xml.push_str(&format!(
                "  <entry>\n    <id>{}</id>\n    <title>{}</title>\n    <updated>{}</updated>\n    <link rel=\"acquisition\" type=\"{}\" href=\"{}\"/>\n  </entry>\n",
                p.id,
                xml_escape(&p.title),
                p.updated.clone().unwrap_or_default(),
                MEDIA_TYPE_EPUB,
                p.links[0].href,
            ));
        }
        xml.push_str("</feed>");
        xml
    }

    fn xml_escape(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
    }

    fn make_client(url: Url) -> OpdsClient {
        let config = CatalogConfig::new("grimmory", url, "alice", "secret".to_string()).unwrap();
        OpdsClient::new(config).unwrap()
    }

    struct TestEnv {
        _dir: tempfile::TempDir,
        store: LibraryStore,
        account_id: i64,
        content_root: std::path::PathBuf,
        catalog_url: Url,
    }

    async fn setup_env(catalog_url: Url) -> TestEnv {
        let dir = tempdir().unwrap();
        let store = LibraryStore::open(dir.path().join("client.db"))
            .await
            .unwrap();
        // Match the account identity used by the refresh flow, which derives
        // it from CatalogConfig::base_url (always trailing slash).
        let account_base = format!("{}/", catalog_url.as_str().trim_end_matches('/'));
        let account = store
            .ensure_catalog_account(
                "grimmory".to_string(),
                account_base,
                "alice".to_string(),
            )
            .await
            .unwrap();
        let content_root = dir.path().join("content");
        std::fs::create_dir_all(&content_root).unwrap();
        TestEnv {
            _dir: dir,
            store,
            account_id: account.id,
            content_root,
            catalog_url,
        }
    }

    /// Seeds a previously downloaded book whose stored metadata and acquisition
    /// URL exactly match what a refresh of `meta` would compute.
    async fn seed_downloaded_book(env: &TestEnv, meta: &Publication) {
        let metadata_json = serde_json::to_string(meta).unwrap();
        let upsert = env
            .store
            .upsert_publication(crate::persist::PublicationInput {
                account_id: env.account_id,
                provider: "grimmory".to_string(),
                canonical_id: meta.id.clone(),
                metadata_json,
            })
            .await
            .unwrap();
        let resolved = resolve_link(&env.catalog_url, &meta.links[0].href).unwrap();
        let acquisition = env
            .store
            .upsert_acquisition(crate::persist::AcquisitionInput {
                publication_id: upsert.publication.id,
                media_type: "application/epub+zip".to_string(),
                canonical_url: resolved.url.as_str().to_string(),
            })
            .await
            .unwrap();
        let revision = env
            .store
            .create_file_revision(crate::persist::RevisionInput {
                acquisition_id: acquisition.acquisition.id,
                expected_length: None,
                expected_hash: None,
                hash_algorithm: None,
                local_relative_path: None,
            })
            .await
            .unwrap();
        let job = env.store.create_download_job(revision.id).await.unwrap();
        assert!(env
            .store
            .set_job_state(job.id, JobState::Running, None)
            .await
            .unwrap());
        let relative = format!("{}.epub", meta.id);
        env.store
            .complete_download(revision.id, relative, job.id)
            .await
            .unwrap();

        let file_path = env.content_root.join(format!("{}.epub", meta.id));
        std::fs::write(file_path, b"verified epub").unwrap();
    }

    #[tokio::test]
    async fn refresh_detects_new_changed_and_removed_publications() {
        let book1_old = publication("book-1", "First Book");
        let book_old = publication("book-old", "Vanishing Book");
        let book1_new = publication("book-1", "First Book Renamed");
        let book_new = publication("book-new", "Fresh Arrival");
        let old_feed = feed_for(
            "Catalog v1",
            &[book1_old.clone(), book_old.clone()],
            None,
        );
        let new_feed = feed_for("Catalog v2", &[book1_new, book_new], None);

        let hits = Arc::new(AtomicUsize::new(0));
        let route_hits = hits.clone();
        let app = Router::new().route(
            "/opds",
            get(move || {
                let hits = route_hits.clone();
                let old_feed = old_feed.clone();
                let new_feed = new_feed.clone();
                async move {
                    let n = hits.fetch_add(1, Ordering::SeqCst);
                    if n == 0 {
                        (StatusCode::OK, Body::from(old_feed))
                    } else {
                        (StatusCode::OK, Body::from(new_feed))
                    }
                }
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let catalog_url = server.server_url("/opds").unwrap();

        let env = setup_env(catalog_url.clone()).await;
        seed_downloaded_book(&env, &book1_old).await;
        seed_downloaded_book(&env, &book_old).await;
        let vanishing_local = env.content_root.join("book-old.epub");
        assert!(vanishing_local.exists());

        let client = make_client(catalog_url.clone());

        // Baseline refresh against the unchanged feed must be a no-op.
        let baseline = refresh_library_metadata(&env.store, &client, "grimmory")
            .await
            .unwrap();
        assert!(baseline.added.is_empty(), "{:?}", baseline.added);
        assert!(baseline.changed.is_empty(), "{:?}", baseline.changed);
        assert!(baseline.removed.is_empty(), "{:?}", baseline.removed);

        // The server now renames book-1, adds book-new and drops book-old.
        let report = refresh_library_metadata(&env.store, &client, "grimmory")
            .await
            .unwrap();

        assert_eq!(report.pages_visited, 1);
        assert!(!report.truncated);
        assert_eq!(report.publications_seen, 2);
        assert_eq!(report.added, vec!["book-new".to_string()]);
        assert_eq!(report.changed, vec!["book-1".to_string()]);
        assert_eq!(report.removed, vec!["book-old".to_string()]);

        let changed_pub = env
            .store
            .find_publication(env.account_id, "grimmory".into(), "book-1".into())
            .await
            .unwrap()
            .unwrap();
        assert!(changed_pub.metadata_json.contains("First Book Renamed"));
        assert!(changed_pub.available, "still advertised stays available");

        let removed_pub = env
            .store
            .find_publication(env.account_id, "grimmory".into(), "book-old".into())
            .await
            .unwrap()
            .unwrap();
        assert!(!removed_pub.available, "server removal must be recorded");
        assert!(
            vanishing_local.exists(),
            "server removal must never delete local files"
        );
    }

    #[tokio::test]
    async fn server_removal_keeps_records_visible_as_unavailable() {
        let app = Router::new().route(
            "/opds",
            get(|| async { (StatusCode::OK, Body::from(feed_for("Empty", &[], None))) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let catalog_url = server.server_url("/opds").unwrap();

        let env = setup_env(catalog_url.clone()).await;
        seed_downloaded_book(&env, &publication("book-9", "Kept Locally")).await;
        let local_file = env.content_root.join("book-9.epub");
        assert!(local_file.exists());

        let client = make_client(catalog_url.clone());
        let report = refresh_library_metadata(&env.store, &client, "grimmory")
            .await
            .unwrap();

        assert_eq!(report.removed, vec!["book-9".to_string()]);
        assert!(local_file.exists(), "local content survives server removal");

        let snapshot = env.store.library_snapshot().await.unwrap();
        assert_eq!(snapshot.unavailable.len(), 1);
        assert_eq!(
            snapshot.unavailable[0].local_relative_path.as_deref(),
            Some("book-9.epub"),
            "unavailable record still points at the local copy for explicit deletion"
        );
        assert!(snapshot.complete.is_empty());
    }

    #[tokio::test]
    async fn repeated_refresh_is_stable() {
        let app = Router::new().route(
            "/opds",
            get(|| async {
                (
                    StatusCode::OK,
                    Body::from(feed_for("Stable", &[publication("book-a", "Alpha")], None)),
                )
            }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let catalog_url = server.server_url("/opds").unwrap();

        let env = setup_env(catalog_url.clone()).await;
        let client = make_client(catalog_url.clone());

        let first = refresh_library_metadata(&env.store, &client, "grimmory")
            .await
            .unwrap();
        assert_eq!(first.added, vec!["book-a".to_string()]);
        assert!(first.changed.is_empty());
        assert!(first.removed.is_empty());

        let second = refresh_library_metadata(&env.store, &client, "grimmory")
            .await
            .unwrap();
        assert!(second.added.is_empty());
        assert!(second.changed.is_empty());
        assert!(second.removed.is_empty());
        assert_eq!(second.publications_seen, 1);
    }

    #[tokio::test]
    async fn pagination_walk_prevents_false_removals() {
        let page_two = feed_for("Page two", &[publication("book-2", "Second")], None);
        let page_one = feed_for(
            "Page one",
            &[publication("book-1", "First")],
            Some("/opds?page=2"),
        );

        let app = Router::new().route(
            "/opds",
            get(
                move |axum::extract::Query(query): axum::extract::Query<std::collections::HashMap<String, String>>| {
                    let page_one = page_one.clone();
                    let page_two = page_two.clone();
                    async move {
                        if query.contains_key("page") {
                            (StatusCode::OK, Body::from(page_two))
                        } else {
                            (StatusCode::OK, Body::from(page_one))
                        }
                    }
                },
            ),
        );
        let server = TestServer::builder().http_transport().build(app);
        let catalog_url = server.server_url("/opds").unwrap();

        let env = setup_env(catalog_url.clone()).await;
        seed_downloaded_book(&env, &publication("book-1", "First")).await;
        seed_downloaded_book(&env, &publication("book-2", "Second")).await;

        let client = make_client(catalog_url.clone());
        let report = refresh_library_metadata(&env.store, &client, "grimmory")
            .await
            .unwrap();

        assert_eq!(report.pages_visited, 2);
        assert!(!report.truncated);
        assert!(
            report.removed.is_empty(),
            "books on later pages must not be marked removed: {:?}",
            report.removed
        );
    }

    #[tokio::test]
    async fn auth_failure_aborts_refresh_without_availability_changes() {
        let app = Router::new().route(
            "/opds",
            get(|| async { (StatusCode::UNAUTHORIZED, Body::from("denied")) }),
        );
        let server = TestServer::builder().http_transport().build(app);
        let catalog_url = server.server_url("/opds").unwrap();

        let env = setup_env(catalog_url.clone()).await;
        seed_downloaded_book(&env, &publication("book-1", "First")).await;

        let client = make_client(catalog_url.clone());
        let err = refresh_library_metadata(&env.store, &client, "grimmory")
            .await
            .unwrap_err();
        assert!(matches!(err, RefreshError::Transport(_)));

        let untouched = env
            .store
            .find_publication(env.account_id, "grimmory".into(), "book-1".into())
            .await
            .unwrap()
            .unwrap();
        assert!(
            untouched.available,
            "a failed refresh must not change availability"
        );
    }

    #[test]
    fn feed_helper_produces_parseable_catalog() {
        let xml = feed_for(
            "Helper",
            &[publication("b1", "One"), publication("b2", "Two")],
            Some("/opds?page=2"),
        );
        let catalog = crate::opds::parse_catalog_from_str(&xml).unwrap();
        assert_eq!(catalog.publications.len(), 2, "xml:\n{xml}");
        assert_eq!(catalog.publications[0].id, "b1");
        assert_eq!(catalog.publications[0].title, "One");
    }

    #[test]
    fn acquisition_helpers_filter_and_compare() {
        let base = Url::parse("https://books.example.com/opds").unwrap();
        let mut same_origin = publication("book-1", "T");
        let cross = Acquisition {
            href: "https://evil.example.net/book.epub".to_string(),
            r#type: Some(MEDIA_TYPE_EPUB.to_string()),
            media_type: Some(MEDIA_TYPE_EPUB.to_string()),
            cost: None,
            rel: Some("acquisition".to_string()),
        };
        let mobi = Acquisition {
            href: "/download/book.mobi".to_string(),
            r#type: None,
            media_type: Some("application/x-mobipocket-ebook".to_string()),
            cost: None,
            rel: Some("acquisition".to_string()),
        };
        same_origin.links.push(cross);
        same_origin.links.push(mobi);

        let resolved = feed_acquisitions(&same_origin, &base, "https://books.example.com");
        assert_eq!(resolved.len(), 1, "cross-origin and unsupported links are skipped");
        assert_eq!(resolved[0].0, MEDIA_TYPE_EPUB);
        assert_eq!(
            resolved[0].1.as_str(),
            "https://books.example.com/download/book-1.epub"
        );

        let existing = std::collections::HashMap::from([(
            "application/epub+zip".to_string(),
            "https://books.example.com/download/book-1.epub".to_string(),
        )]);
        assert!(!acquisition_set_changed(&existing, &resolved));

        let moved = std::collections::HashMap::from([(
            "application/epub+zip".to_string(),
            "https://books.example.com/download/book-v2.epub".to_string(),
        )]);
        assert!(acquisition_set_changed(&moved, &resolved));

        assert_eq!(supported_media_type(Some(MEDIA_TYPE_EPUB)), Some(MEDIA_TYPE_EPUB));
        assert_eq!(supported_media_type(Some("application/x-mobi")), None);
        assert_eq!(supported_media_type(None), None);
    }
}


