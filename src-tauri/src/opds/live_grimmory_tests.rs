//! Live interop verification against the real Grimmory OPDS feed.
//!
//! The captured fixture `test/fixtures/opds/grimmory_live_sample.xml` is a
//! verbatim page of the production Grimmory acquisition feed. These tests
//! prove the parser handles the exact shapes Grimmory emits: EPUB-3
//! collection meta series, dc:publisher, Atom categories, cover image
//! links, opensearch pagination, and full-rel acquisition links.

use crate::opds::parser::parse_catalog;

const LIVE_SAMPLE: &str = include_str!("../../test/fixtures/opds/grimmory_live_sample.xml");

#[test]
fn live_grimmory_feed_parses_all_entries() {
    let catalog = parse_catalog(LIVE_SAMPLE).expect("live feed must parse");
    assert_eq!(catalog.publications.len(), 5, "5 entries requested");
}

#[test]
fn live_grimmory_feed_exposes_pagination() {
    let catalog = parse_catalog(LIVE_SAMPLE).expect("live feed must parse");
    let pagination = catalog.pagination.expect("Grimmory paginates");
    assert_eq!(pagination.total, Some(481));
    assert!(pagination.next.is_some(), "page 1 has a next link");
    assert!(catalog
        .links
        .iter()
        .any(|l| l.rel.as_deref() == Some("next")));
}

#[test]
fn live_grimmory_entries_have_full_metadata() {
    let catalog = parse_catalog(LIVE_SAMPLE).expect("live feed must parse");
    for book in &catalog.publications {
        assert!(!book.id.is_empty());
        assert!(!book.title.is_empty(), "every entry has a title");
        assert!(
            !book.authors.is_empty(),
            "entry {} missing authors",
            book.title
        );
        // Every Grimmory entry carries an EPUB acquisition link and cover art.
        assert!(
            !book.links.is_empty(),
            "entry {} has no acquisitions",
            book.title
        );
        assert!(
            book.representative.is_some(),
            "entry {} missing cover image",
            book.title
        );
    }
    let with_series = catalog
        .publications
        .iter()
        .filter(|b| b.series.is_some())
        .count();
    assert!(with_series > 0, "library contains series books");
    let blackflame = catalog
        .publications
        .iter()
        .find(|b| b.title == "Blackflame")
        .expect("fixture includes Blackflame");
    assert_eq!(
        blackflame.publisher.as_deref(),
        Some("Hidden Gnome Publishing")
    );
    assert!(blackflame.categories.contains(&"Fantasy".to_string()));
    let series = blackflame.series.as_ref().unwrap();
    assert_eq!(series.name, "Cradle");
    assert_eq!(series.index, Some(3.0));
    assert!(!blackflame.descriptions.is_empty(), "synopsis parsed");
}
