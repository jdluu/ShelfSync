use super::{
    Acquisition, Catalog, NavigationLink, OpdsError, Pagination, Publication,
    RepresentativeLink, Series,
};
use quick_xml::escape;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::HashMap;

use crate::opds::transport::MAX_FEED_SIZE;

pub fn parse_catalog(xml: &str) -> Result<Catalog, OpdsError> {
    parse_catalog_from_str(xml)
}

pub fn parse_catalog_from_str(xml: &str) -> Result<Catalog, OpdsError> {
    if xml.len() as u64 > MAX_FEED_SIZE {
        return Err(OpdsError::FeedTooLarge(xml.len() as u64));
    }

    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();

    let mut title = String::new();
    let mut updated = None;
    let mut links = Vec::new();
    let mut publications = Vec::new();
    let mut total_results: Option<u32> = None;
    let mut pending_total = false;

    let mut current_state = ParsingState::Catalog;
    let mut current_pub: Option<PublicationBuilder> = None;
    let mut text_buf = String::new();
    let mut in_author = false;
    let mut authors = Vec::new();
    let mut pending_identifier_scheme: Option<String> = None;

    loop {
        buf.clear();
        let event = match reader.read_event_into(&mut buf) {
            Ok(e) => e,
            Err(e) => return Err(OpdsError::InvalidXml(format!("XML parsing error: {}", e))),
        };

        match event {
            Event::Start(e) | Event::Empty(e) => {
                let local_name = get_local_name(e.name().as_ref());

                match current_state {
                    ParsingState::Catalog => {
                        handle_catalog_element(
                            &e,
                            &local_name,
                            &mut updated,
                            &mut authors,
                            &mut links,
                            &mut publications,
                            &mut current_pub,
                            &mut in_author,
                            &mut current_state,
                        );
                        if current_state == ParsingState::Catalog {
                            // Feed-level metadata that does not belong to an entry.
                            match local_name.as_str() {
                                "totalresults" | "totalResults" => {
                                    pending_total = true;
                                }
                                "link" | "opensearch:itemsperpage" | "opensearch:startindex"
                                | "opensearch:query" => {}
                                _ => {}
                            }
                        }
                    }
                    ParsingState::Publication => {
                        handle_publication_element(
                            &e,
                            &local_name,
                            &mut current_pub,
                            &mut in_author,
                            &mut pending_identifier_scheme,
                        );
                    }
                }
            }
            Event::Text(e) => {
                text_buf = escape::unescape(std::str::from_utf8(&*e).unwrap_or(""))
                    .map(|c| c.into_owned())
                    .unwrap_or_else(|_| text_buf.clone());
            }
            Event::End(e) => {
                let local_name = get_local_name(e.name().as_ref());
                handle_end(
                    &local_name,
                    &mut title,
                    &mut updated,
                    &mut current_pub,
                    &mut publications,
                    &mut current_state,
                    &mut text_buf,
                    &mut in_author,
                    &mut authors,
                    &mut pending_identifier_scheme,
                );
                if pending_total {
                    if let Ok(v) = trimmed_total(&text_buf) {
                        total_results = Some(v);
                    }
                    pending_total = false;
                }
                text_buf.clear();
                pending_identifier_scheme = None;
            }
            Event::Eof => break,
            _ => {}
        }
    }

    let next_href = links
        .iter()
        .find(|l| l.rel.as_deref() == Some("next"))
        .map(|l| l.href.clone());
    let pub_count = publications.len().max(1) as u32;
    let total = total_results;

    let catalog = Catalog {
        title: if title.is_empty() {
            "Unknown Catalog".to_string()
        } else {
            title
        },
        updated,
        authors,
        links,
        publications,
        pagination: Some(Pagination {
            page: 1,
            size: pub_count,
            total,
            next: next_href,
        }),
    };

    Ok(catalog)
}

fn trimmed_total(text: &str) -> Result<u32, ()> {
    text.trim().parse::<u32>().map_err(|_| ())
}

fn get_local_name(name: &[u8]) -> String {
    let name_str = std::str::from_utf8(name).unwrap_or("");
    let stripped = name_str
        .strip_prefix("xml:")
        .or_else(|| name_str.split(':').last())
        .unwrap_or(name_str);
    stripped.to_string()
}

fn handle_catalog_element(
    e: &quick_xml::events::BytesStart,
    local_name: &str,
    _updated: &mut Option<String>,
    _authors: &mut Vec<String>,
    links: &mut Vec<NavigationLink>,
    _publications: &mut Vec<Publication>,
    current_pub: &mut Option<PublicationBuilder>,
    in_author: &mut bool,
    state: &mut ParsingState,
) {
    match local_name {
        "title" => {}
        "updated" => {}
        "author" => {
            *in_author = true;
        }
        "name" => {}
        "link" => {
            let mut link = NavigationLink::default();
            for attr in e.attributes() {
                if let Ok(attr) = attr {
                    let k = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                    match k {
                        "href" => {
                            let v = escape::unescape(
                                std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                            )
                            .unwrap_or_default();
                            link.href = v.into_owned();
                        }
                        "rel" => {
                            let v = escape::unescape(
                                std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                            )
                            .unwrap_or_default();
                            link.rel = Some(v.into_owned());
                        }
                        "title" => {
                            let v = escape::unescape(
                                std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                            )
                            .unwrap_or_default();
                            link.title = Some(v.into_owned());
                        }
                        "type" => {
                            let v = escape::unescape(
                                std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                            )
                            .unwrap_or_default();
                            link.r#type = Some(v.into_owned());
                        }
                        _ => {}
                    }
                }
            }
            if !link.href.is_empty() {
                links.push(link);
            }
        }
        "entry" => {
            *state = ParsingState::Publication;
            *current_pub = Some(PublicationBuilder::new());
        }
        _ => {}
    }
}

fn handle_publication_element(
    e: &quick_xml::events::BytesStart,
    local_name: &str,
    current_pub: &mut Option<PublicationBuilder>,
    in_author: &mut bool,
    pending_identifier_scheme: &mut Option<String>,
) {
    if current_pub.is_none() {
        return;
    }
    let builder = current_pub.as_mut().unwrap();

    match local_name {
        "id" => {
            for attr in e.attributes() {
                if let Ok(attr) = attr {
                    let k = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                    if k == "scheme" {
                        let v = escape::unescape(
                            std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                        )
                        .unwrap_or_default();
                        *pending_identifier_scheme = Some(v.into_owned());
                    }
                }
            }
        }
        "title" => {}
        "updated" | "published" | "pubdate" => {}
        "author" => {
            *in_author = true;
        }
        "name" => {}
        "link" => {
            let mut acq = Acquisition {
                href: String::new(),
                r#type: None,
                media_type: None,
                cost: None,
                rel: None,
            };
            let mut is_image_link = false;
            for attr in e.attributes() {
                if let Ok(attr) = attr {
                    let k = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                    match k {
                        "href" => {
                            let v = escape::unescape(
                                std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                            )
                            .unwrap_or_default();
                            acq.href = v.into_owned();
                        }
                        "type" => {
                            let v = escape::unescape(
                                std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                            )
                            .unwrap_or_default();
                            let type_val = v.into_owned();
                            acq.r#type = Some(type_val.clone());
                            acq.media_type = Some(type_val);
                        }
                        "rel" => {
                            let v = escape::unescape(
                                std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                            )
                            .unwrap_or_default();
                            let rel_val = v.into_owned();
                            // OPDS cover-image relations (1.x/2.x): the entry's
                            // representative cover art, kept out of acquisitions.
                            if rel_val.starts_with("http://opds-spec.org/image") {
                                is_image_link = true;
                            }
                            acq.rel = Some(rel_val);
                        }
                        _ => {}
                    }
                }
            }
            if is_image_link && !acq.href.is_empty() {
                builder.representative = Some(RepresentativeLink {
                    href: acq.href.clone(),
                    r#type: acq.r#type.clone(),
                });
            } else if !acq.href.is_empty() {
                if acq.rel.as_deref() == Some("acquisition")
                    || acq.rel.as_deref() == Some("http://opds-spec.org/acquisition")
                    || acq.rel
                        .as_deref()
                        .unwrap_or("")
                        .starts_with("http://opds-spec.org/acquisition")
                    || acq.rel.is_none()
                {
                    builder.links.push(acq);
                }
            }
        }
        "summary" | "description" | "dc:description" => {}
        "language" | "dc:language" => {}
        "series" | "dc:series" => {}
        "publisher" | "dc:publisher" => {}
        "category" | "dc:subject" => {
            // OPDS 1.x uses Atom <category term="...">; subjects may also
            // appear as dc:subject text content.
            for attr in e.attributes() {
                if let Ok(attr) = attr {
                    if std::str::from_utf8(attr.key.as_ref()).unwrap_or("") == "term" {
                        let v = escape::unescape(
                            std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                        )
                        .unwrap_or_default()
                        .into_owned();
                        if !v.trim().is_empty() {
                            builder.categories.push(v);
                        }
                    }
                }
            }
        }
        "meta" => {
            // EPUB/OPDS collection metadata (Grimmory emits this form):
            // <meta property="belongs-to-collection">Name</meta>
            // <meta property="group-position" refines="#id">3.0</meta>
            let mut property = None;
            let mut refines = None;
            for attr in e.attributes() {
                if let Ok(attr) = attr {
                    match std::str::from_utf8(attr.key.as_ref()).unwrap_or("") {
                        "property" => {
                            property = Some(
                                escape::unescape(
                                    std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                                )
                                .unwrap_or_default()
                                .into_owned(),
                            );
                        }
                        "refines" => {
                            refines = Some(
                                escape::unescape(
                                    std::str::from_utf8(attr.value.as_ref()).unwrap_or(""),
                                )
                                .unwrap_or_default()
                                .into_owned(),
                            );
                        }
                        _ => {}
                    }
                }
            }
            match property.as_deref() {
                Some("belongs-to-collection") => builder.pending_collection = true,
                Some("group-position") => {
                    builder.pending_position_refines = refines.filter(|r| !r.is_empty());
                }
                _ => {}
            }
        }
        "index" => {}
        _ => {}
    }
}

fn handle_end(
    local_name: &str,
    title: &mut String,
    updated: &mut Option<String>,
    current_pub: &mut Option<PublicationBuilder>,
    publications: &mut Vec<Publication>,
    state: &mut ParsingState,
    text: &mut String,
    in_author: &mut bool,
    authors: &mut Vec<String>,
    pending_identifier_scheme: &mut Option<String>,
) {
    let trimmed = text.trim();

    match local_name {
        "title" => {
            if current_pub.is_none() {
                *title = trimmed.to_string();
            } else if let Some(ref mut b) = current_pub {
                if b.title.is_empty() {
                    b.title = trimmed.to_string();
                }
            }
        }
        "updated" => {
            if let Some(ref mut b) = current_pub {
                b.updated = Some(trimmed.to_string());
            } else {
                *updated = Some(trimmed.to_string());
            }
        }
        "published" | "pubdate" => {
            if let Some(ref mut b) = current_pub {
                if b.pubdate.is_none() && !trimmed.is_empty() {
                    b.pubdate = Some(trimmed.to_string());
                }
            }
        }
        "author" => {
            if *in_author && current_pub.is_none() {
                if !trimmed.is_empty() {
                    authors.push(trimmed.to_string());
                }
            } else if *in_author {
                if let Some(ref mut b) = current_pub {
                    if !trimmed.is_empty() {
                        b.authors.push(trimmed.to_string());
                    }
                }
            }
            *in_author = false;
        }
        "name" => {
            if *in_author {
                if !trimmed.is_empty() {
                    if current_pub.is_none() {
                        authors.push(trimmed.to_string());
                    } else if let Some(ref mut b) = current_pub {
                        b.authors.push(trimmed.to_string());
                    }
                }
                *in_author = false;
            }
        }
        "id" => {
            if let Some(ref mut b) = current_pub {
                if !trimmed.is_empty() {
                    if let Some(ref scheme) = pending_identifier_scheme {
                        b.identifiers.insert(scheme.clone(), trimmed.to_string());
                    } else if b.id.is_empty() {
                        b.id = trimmed.to_string();
                    }
                }
            }
        }
        "entry" => {
            if let Some(builder) = current_pub.take() {
                if let Some(publ) = builder.build() {
                    publications.push(publ);
                }
            }
            *state = ParsingState::Catalog;
        }
        "summary" | "description" | "dc:description" => {
            if let Some(ref mut b) = current_pub {
                if !trimmed.is_empty() {
                    b.descriptions.push(trimmed.to_string());
                }
            }
        }
        "language" | "dc:language" => {
            if let Some(ref mut b) = current_pub {
                if !trimmed.is_empty() {
                    b.languages.push(trimmed.to_string());
                }
            }
        }
        "series" | "dc:series" => {
            if let Some(ref mut b) = current_pub {
                if !trimmed.is_empty() {
                    b.series = Some(Series {
                        name: trimmed.to_string(),
                        index: None,
                    });
                }
            }
        }
        "publisher" | "dc:publisher" => {
            if let Some(ref mut b) = current_pub {
                if b.publisher.is_none() && !trimmed.is_empty() {
                    b.publisher = Some(trimmed.to_string());
                }
            }
        }
        "meta" => {
            // Text of <meta property="belongs-to-collection"> or group-position.
            if let Some(ref mut b) = current_pub {
                if b.pending_collection && !trimmed.is_empty() {
                    b.series = Some(Series {
                        name: trimmed.to_string(),
                        index: None,
                    });
                    b.pending_collection = false;
                } else if b.pending_position_refines.is_some() {
                    // group-position refines the collection declared in this
                    // entry; apply when a series is present.
                    if let Ok(idx) = trimmed.parse::<f64>() {
                        if let Some(ref mut s) = b.series.as_mut() {
                            s.index = Some(idx);
                        }
                    }
                    b.pending_position_refines = None;
                }
            }
        }
        "subject" | "dc:subject" => {
            if let Some(ref mut b) = current_pub {
                if !trimmed.is_empty() {
                    b.categories.push(trimmed.to_string());
                }
            }
        }
        "index" => {
            if let Some(ref mut b) = current_pub {
                if let Some(ref mut s) = b.series.as_mut() {
                    if let Ok(idx) = trimmed.parse::<f64>() {
                        s.index = Some(idx);
                    }
                }
            }
        }
        "link" => {}
        "feed" => {}
        _ => {}
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum ParsingState {
    Catalog,
    Publication,
}

#[derive(Debug)]
struct PublicationBuilder {
    id: String,
    updated: Option<String>,
    title: String,
    authors: Vec<String>,
    pubdate: Option<String>,
    publisher: Option<String>,
    identifiers: HashMap<String, String>,
    series: Option<Series>,
    languages: Vec<String>,
    categories: Vec<String>,
    descriptions: Vec<String>,
    links: Vec<Acquisition>,
    representative: Option<RepresentativeLink>,
    pending_collection: bool,
    pending_position_refines: Option<String>,
    series_refines_id: Option<String>,
}

impl PublicationBuilder {
    fn new() -> Self {
        PublicationBuilder {
            id: String::new(),
            updated: None,
            title: String::new(),
            authors: Vec::new(),
            pubdate: None,
            publisher: None,
            identifiers: HashMap::new(),
            series: None,
            languages: Vec::new(),
            categories: Vec::new(),
            descriptions: Vec::new(),
            links: Vec::new(),
            representative: None,
            pending_collection: false,
            pending_position_refines: None,
            series_refines_id: None,
        }
    }

    fn build(self) -> Option<Publication> {
        if self.id.is_empty() {
            return None;
        }
        Some(Publication {
            id: self.id,
            updated: self.updated,
            title: if self.title.is_empty() {
                "Unknown".to_string()
            } else {
                self.title
            },
            authors: self.authors,
            pubdate: self.pubdate,
            publisher: self.publisher,
            identifiers: self.identifiers,
            series: self.series,
            languages: self.languages,
            categories: self.categories,
            relations: Vec::new(),
            descriptions: self.descriptions,
            links: self.links,
            providers: None,
            representative: self.representative,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE_ROOT_CATALOG: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="https://opds.org/schema/2010/feed">
  <title>Grimmory OPDS</title>
  <updated>2024-01-15T10:30:00Z</updated>
  <author>
    <name>Grimmory</name>
  </author>
  <link href="/api/v1/opds" rel="self" type="application/atom+xml; profile=opds-gallery"/>
  <link href="/api/v1/opds" rel="alternate" type="text/html"/>
  <entry>
    <title>Recent Books</title>
  </entry>
</feed>"#;

    const FIXTURE_BOOK_ENTRY: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>The Stormlight Archive</title>
  <entry>
    <id>grimmory:book:42</id>
    <title>The Way of Kings</title>
    <author>Brandon Sanderson</author>
    <id scheme="grimmory">42</id>
    <link href="/api/v1/opds/42/download" rel="acquisition" type="application/epub+zip"/>
    <link href="/api/v1/opds/42/download" rel="acquisition" type="application/pdf"/>
  </entry>
  <entry>
    <id>grimmory:book:43</id>
    <title>Words of Radiance</title>
    <link href="/api/v1/opds/43/download" rel="acquisition" type="application/epub+zip"/>
  </entry>
</feed>"#;

    const FIXTURE_PAGINATED: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Large Library</title>
  <link href="/api/v1/opds" rel="self"/>
  <link href="/api/v1/opds?page=2" rel="next"/>
  <entry>
    <id>grimmory:book:1</id>
    <title>Book One</title>
    <link href="/api/v1/opds/1/download" rel="acquisition" type="application/epub+zip"/>
  </entry>
</feed>"#;

    #[test]
    fn test_parse_root_catalog() {
        let result = parse_catalog(FIXTURE_ROOT_CATALOG).expect("Should parse");
        assert_eq!(result.title, "Grimmory OPDS");
        assert!(!result.links.is_empty());
        let self_link = result
            .links
            .iter()
            .find(|l| l.rel.as_deref() == Some("self"));
        assert!(self_link.is_some());
    }

    #[test]
    fn test_parse_publication_with_acquisitions() {
        let result = parse_catalog(FIXTURE_BOOK_ENTRY).expect("Should parse");
        assert_eq!(result.title, "The Stormlight Archive");
        assert_eq!(result.publications.len(), 2);

        let book = &result.publications[0];
        assert_eq!(book.title, "The Way of Kings");
    }

    #[test]
    fn test_parse_acquisitions() {
        let result = parse_catalog(FIXTURE_BOOK_ENTRY).expect("Should parse");
        let book = &result.publications[0];
        assert!(book.links.len() >= 2);
    }

    #[test]
    fn test_grimmory_style_entry_full_metadata() {
        // Mirrors the live Grimmory/Booklore acquisition feed: EPUB-3
        // collection meta for series, dc:publisher, Atom categories, cover
        // image links, and a full-rel acquisition link.
        let feed = r##"<entry>
    <title>Blackflame</title>
    <id>urn:booklore:book:934</id>
    <updated>2026-08-15T01:00:06Z</updated>
    <author><name>Will Wight</name></author>
    <dc:publisher>Hidden Gnome Publishing</dc:publisher>
    <dc:language>en</dc:language>
    <category term="Fantasy"/>
    <category term="Adventure"/>
    <summary>&lt;p&gt;Lindon has a year left.&lt;/p&gt;</summary>
    <meta property="belongs-to-collection" id="series">Cradle</meta>
    <meta property="group-position" refines="#series">3.0</meta>
    <link href="/api/v1/opds/934/download?fileId=934" rel="http://opds-spec.org/acquisition" type="application/epub+zip" title="EPUB"/>
    <link rel="http://opds-spec.org/image" href="/api/v1/opds/934/cover" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="/api/v1/opds/934/cover" type="image/jpeg"/>
  </entry>"##;
        let wrapped = format!(
            r#"<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog">{}</feed>"#,
            feed
        );
        let result = parse_catalog(&wrapped).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        let book = &result.publications[0];
        assert_eq!(book.title, "Blackflame");
        assert_eq!(book.authors, vec!["Will Wight"]);
        assert_eq!(
            book.publisher.as_deref(),
            Some("Hidden Gnome Publishing")
        );
        assert!(book.languages.contains(&"en".to_string()));
        assert!(book.categories.contains(&"Fantasy".to_string()));
        assert!(book.categories.contains(&"Adventure".to_string()));
        let series = book.series.as_ref().expect("series from collection meta");
        assert_eq!(series.name, "Cradle");
        assert_eq!(series.index, Some(3.0));
        assert!(!book.descriptions.is_empty());
        // Cover image links become the representative, never acquisitions.
        let rep = book.representative.as_ref().expect("representative cover");
        assert_eq!(rep.href, "/api/v1/opds/934/cover");
        assert_eq!(rep.r#type.as_deref(), Some("image/jpeg"));
        assert_eq!(book.links.len(), 1);
        assert_eq!(book.links[0].href, "/api/v1/opds/934/download?fileId=934");
    }

    #[test]
    fn test_opensearch_total_results_populates_pagination() {
        let feed = r#"<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <title>Catalog</title>
  <opensearch:totalResults>481</opensearch:totalResults>
  <link rel="next" href="/catalog?page=2&amp;size=50" type="application/atom+xml"/>
  <entry>
    <id>urn:book:1</id>
    <title>One</title>
    <link href="/1.epub" rel="http://opds-spec.org/acquisition" type="application/epub+zip"/>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        let pagination = result.pagination.expect("pagination present");
        assert_eq!(pagination.total, Some(481));
        assert_eq!(
            pagination.next.as_deref(),
            Some("/catalog?page=2&size=50")
        );
    }

    #[test]
    fn test_pagination_next_link() {
        let result = parse_catalog(FIXTURE_PAGINATED).expect("Should parse");
        let next_link = result
            .links
            .iter()
            .find(|l| l.rel.as_deref() == Some("next"));
        assert!(next_link.is_some());
    }

    #[test]
    fn test_parse_publication_count() {
        let result = parse_catalog(FIXTURE_BOOK_ENTRY).expect("Should parse");
        assert_eq!(result.publications.len(), 2);
    }

    #[test]
    fn test_missing_required_title() {
        let bare_feed = r#"<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>"#;
        let result = parse_catalog(bare_feed).expect("Should parse with default title");
        assert_eq!(result.title, "Unknown Catalog");
    }

    #[test]
    fn test_publication_without_acquisitions() {
        let no_acq = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title>Book Without Download</title>
  </entry>
</feed>"#;
        let result = parse_catalog(no_acq).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        let book = &result.publications[0];
        assert!(book.links.is_empty());
    }

    #[test]
    fn test_empty_feed() {
        let empty = r#"<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title></title></feed>"#;
        let result = parse_catalog(empty).expect("Should parse");
        assert_eq!(result.title, "Unknown Catalog");
    }

    #[test]
    fn test_feed_size_limit() {
        let large_content: String = "X".repeat(20 * 1024 * 1024);
        let large_xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>{}</title>
</feed>"#,
            large_content
        );
        let result = parse_catalog(&large_xml);
        assert!(result.is_err());
        if let Err(OpdsError::FeedTooLarge(size)) = result {
            assert!(size > MAX_FEED_SIZE);
        }
    }

    #[test]
    fn test_malformed_xml_unclosed_tag() {
        let malformed = r#"<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Unclosed</title><entry><id>1"</#;
        let result = parse_catalog(malformed);
        assert!(result.is_err());
        if let Err(OpdsError::InvalidXml(_)) = result {
            assert!(true);
        } else {
            panic!("Expected InvalidXml error");
        }
    }

    #[test]
    fn test_malformed_xml_invalid_entity() {
        let malformed = r#"<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Test &invalid;</title></feed>"#;
        let result = parse_catalog(malformed);
        assert!(result.is_err());
    }

    #[test]
    fn test_entry_without_id_is_skipped() {
        let no_id = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <title>Missing ID Entry</title>
  </entry>
</feed>"#;
        let result = parse_catalog(no_id).expect("Should parse");
        assert_eq!(result.publications.len(), 0);
        assert_eq!(result.title, "Test");
    }

    #[test]
    fn test_catalog_level_authors() {
        let feed_with_authors = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Books</title>
  <author>
    <name>Author One</name>
  </author>
  <author>
    <name>Author Two</name>
  </author>
  <entry>
    <id>book-1</id>
    <title>Book One</title>
  </entry>
</feed>"#;
        let result = parse_catalog(feed_with_authors).expect("Should parse");
        assert_eq!(result.authors.len(), 2);
        assert_eq!(result.authors[0], "Author One");
        assert_eq!(result.authors[1], "Author Two");
    }

    #[test]
    fn test_publication_authors_simple_format() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title>Book One</title>
    <author>Simple Author</author>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        assert_eq!(result.publications[0].authors.len(), 1);
        assert_eq!(result.publications[0].authors[0], "Simple Author");
    }

    #[test]
    fn test_publication_authors_nested_format() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title>Book One</title>
    <author>
      <name>Nested Author</name>
    </author>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        assert_eq!(result.publications[0].authors.len(), 1);
        assert_eq!(result.publications[0].authors[0], "Nested Author");
    }

    #[test]
    fn test_publication_identifiers() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>urn:isbn:978-1234567890</id>
    <title>Book with Identifiers</title>
    <id scheme="isbn">978-1234567890</id>
    <id scheme="grimmory">book-42</id>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        let book = &result.publications[0];
        assert!(book.identifiers.contains_key("isbn"));
        assert_eq!(
            book.identifiers.get("isbn"),
            Some(&"978-1234567890".to_string())
        );
        assert!(book.identifiers.contains_key("grimmory"));
        assert_eq!(
            book.identifiers.get("grimmory"),
            Some(&"book-42".to_string())
        );
    }

    #[test]
    fn test_duplicate_identifier_scheme_overwrites() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title>Book with Duplicate Identifiers</title>
    <id scheme="isbn">978-0000000001</id>
    <id scheme="isbn">978-0000000002</id>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        let book = &result.publications[0];
        assert!(book.identifiers.contains_key("isbn"));
        assert_eq!(
            book.identifiers.get("isbn"),
            Some(&"978-0000000002".to_string())
        );
    }

    #[test]
    fn test_publication_pubdate() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title>Book One</title>
    <published>2024-01-15</published>
    <updated>2024-01-20T10:00:00Z</updated>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        let book = &result.publications[0];
        assert_eq!(book.pubdate, Some("2024-01-15".to_string()));
        assert_eq!(book.updated, Some("2024-01-20T10:00:00Z".to_string()));
    }

    #[test]
    fn test_publication_published_date_alias() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title>Book One</title>
    <pubdate>2023-06-01</pubdate>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        assert_eq!(
            result.publications[0].pubdate,
            Some("2023-06-01".to_string())
        );
    }

    #[test]
    fn test_catalog_navigation_links_complete() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Catalog</title>
  <author>
    <name>Test Author</name>
  </author>
  <link href="/api/catalog" rel="self" type="application/atom+xml"/>
  <link href="/api/catalog" rel="alternate" type="text/html" title="HTML View"/>
  <link href="/api/catalog?page=2" rel="next" type="application/atom+xml"/>
  <entry>
    <id>book-1</id>
    <title>Book One</title>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.title, "Test Catalog");
        assert_eq!(result.authors.len(), 1);
        assert_eq!(result.authors[0], "Test Author");

        assert_eq!(result.links.len(), 3);

        let self_link = result
            .links
            .iter()
            .find(|l| l.rel.as_deref() == Some("self"))
            .expect("Should have self link");
        assert_eq!(self_link.href, "/api/catalog");
        assert_eq!(self_link.r#type, Some("application/atom+xml".to_string()));

        let alternate_link = result
            .links
            .iter()
            .find(|l| l.rel.as_deref() == Some("alternate"))
            .expect("Should have alternate link");
        assert_eq!(alternate_link.title, Some("HTML View".to_string()));

        let next_link = result
            .links
            .iter()
            .find(|l| l.rel.as_deref() == Some("next"))
            .expect("Should have next link");
        assert_eq!(next_link.href, "/api/catalog?page=2");
    }

    #[test]
    fn test_publication_links_filters_non_acquisition() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title>Book One</title>
    <link href="/books/1.epub" rel="acquisition" type="application/epub+zip"/>
    <link href="/books/1.pdf" rel="acquisition" type="application/pdf"/>
    <link href="/covers/1.jpg" rel="image" type="image/jpeg"/>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        let book = &result.publications[0];

        assert_eq!(book.links.len(), 2);
        let has_acquisition = book
            .links
            .iter()
            .any(|l| l.rel.as_deref() == Some("acquisition"));
        let has_image = book.links.iter().any(|l| l.rel.as_deref() == Some("image"));
        assert!(has_acquisition);
        assert!(!has_image);
    }

    #[test]
    fn test_publication_link_without_rel_is_accepted() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title>Book One</title>
    <link href="/books/1.epub" type="application/epub+zip"/>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        let book = &result.publications[0];
        assert_eq!(book.links.len(), 1);
        assert!(book.links[0].href == "/books/1.epub");
    }

    #[test]
    fn test_duplicate_entries_allowed() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title>First Book</title>
    <link href="/books/1.epub" rel="acquisition" type="application/epub+zip"/>
  </entry>
  <entry>
    <id>book-1</id>
    <title>Duplicate Book</title>
    <link href="/books/1-dup.epub" rel="acquisition" type="application/epub+zip"/>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 2);
        assert_eq!(result.publications[0].title, "First Book");
        assert_eq!(result.publications[1].title, "Duplicate Book");
    }

    #[test]
    fn test_entry_with_empty_title_uses_default() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title></title>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        assert_eq!(result.publications[0].title, "Unknown");
    }

    #[test]
    fn test_entry_with_whitespace_title_uses_default() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry>
    <id>book-1</id>
    <title>   </title>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        assert_eq!(result.publications[0].title, "Unknown");
    }

    #[test]
    fn test_publication_metadata_complete() {
        let feed = r#"<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <title>Complete Test</title>
  <entry>
    <id>book-complete</id>
    <title>Complete Publication</title>
    <author>Author A</author>
    <author>Author B</author>
    <published>2024-01-01</published>
    <updated>2024-01-15T12:00:00Z</updated>
    <id scheme="isbn">978-0000000000</id>
    <id scheme="publisher">pub-123</id>
    <language>en</language>
    <dc:language>en-US</dc:language>
    <summary>A complete book description</summary>
    <series>Complete Series</series>
    <index>2.0</index>
    <link href="/download/book-complete.epub" rel="acquisition" type="application/epub+zip"/>
  </entry>
</feed>"#;
        let result = parse_catalog(feed).expect("Should parse");
        assert_eq!(result.publications.len(), 1);
        let book = &result.publications[0];

        assert_eq!(book.title, "Complete Publication");
        assert_eq!(book.authors.len(), 2);
        assert_eq!(book.authors[0], "Author A");
        assert_eq!(book.authors[1], "Author B");
        assert_eq!(book.pubdate, Some("2024-01-01".to_string()));
        assert_eq!(book.updated, Some("2024-01-15T12:00:00Z".to_string()));
        assert!(book.identifiers.contains_key("isbn"));
        assert!(book.identifiers.contains_key("publisher"));
        assert!(book.languages.contains(&"en".to_string()));
        assert!(book.languages.contains(&"en-US".to_string()));
        assert_eq!(book.descriptions.len(), 1);
        assert!(book.series.is_some());
        assert_eq!(book.series.as_ref().unwrap().name, "Complete Series");
        assert_eq!(book.series.as_ref().unwrap().index, Some(2.0));
        assert_eq!(book.links.len(), 1);
    }
}
