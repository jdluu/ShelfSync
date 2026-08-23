use rusqlite::{params, Connection, OptionalExtension};
use tempfile::tempdir;

use super::error::PersistError;
use super::model::{
    AcquisitionInput, JobState, PublicationInput, RevisionInput, StoredDownloadJob,
};
use super::repo;
use super::schema::{self, CURRENT_SCHEMA_VERSION};
use super::store::LibraryStore;

fn migrated_conn() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    schema::ensure_runtime_pragmas(&conn).unwrap();
    schema::run_migrations(&mut conn).unwrap();
    conn
}

fn publication_input(account_id: i64, canonical_id: &str, title: &str) -> PublicationInput {
    PublicationInput {
        account_id,
        provider: "grimmory".to_string(),
        canonical_id: canonical_id.to_string(),
        metadata_json: format!(r#"{{"title":"{title}"}}"#),
    }
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
        .unwrap()
}

#[test]
fn duplicate_publications_dedupe_by_provider_scoped_identity() {
    let mut conn = migrated_conn();
    let account =
        repo::ensure_catalog_account(&conn, "grimmory", "https://books.example.com", "alice")
            .unwrap();

    let first = repo::upsert_publication(&mut conn, &publication_input(account.id, "book-1", "First"))
        .unwrap();
    assert!(first.created);
    assert_eq!(first.publication.provider, "grimmory");
    assert_eq!(first.publication.canonical_id, "book-1");

    let second =
        repo::upsert_publication(&mut conn, &publication_input(account.id, "book-1", "First v2"))
            .unwrap();
    assert!(!second.created);
    assert_eq!(second.publication.id, first.publication.id);
    assert!(second.publication.metadata_json.contains("First v2"));
    assert!(second.publication.updated_at >= first.publication.updated_at);

    let other_book =
        repo::upsert_publication(&mut conn, &publication_input(account.id, "book-2", "Second"))
            .unwrap();
    assert!(other_book.created);
    assert_ne!(other_book.publication.id, first.publication.id);

    let other_account = repo::ensure_catalog_account(
        &conn,
        "grimmory",
        "https://mirror.example.com",
        "alice",
    )
    .unwrap();
    assert_ne!(other_account.id, account.id);
    let mirrored =
        repo::upsert_publication(&mut conn, &publication_input(other_account.id, "book-1", "First"))
            .unwrap();
    assert!(mirrored.created);
    assert_ne!(mirrored.publication.id, first.publication.id);

    assert_eq!(count(&conn, "publication"), 3);

    let found = repo::find_publication(&conn, account.id, "grimmory", "book-1")
        .unwrap()
        .unwrap();
    assert_eq!(found.id, first.publication.id);

    repo::set_publication_available(&conn, found.id, false).unwrap();
    let unavailable = repo::get_publication(&conn, found.id).unwrap().unwrap();
    assert!(!unavailable.available);
}

#[test]
fn format_specific_acquisitions_and_revisions() {
    let mut conn = migrated_conn();
    let account =
        repo::ensure_catalog_account(&conn, "grimmory", "https://books.example.com", "alice")
            .unwrap();
    let upsert =
        repo::upsert_publication(&mut conn, &publication_input(account.id, "book-1", "First"))
            .unwrap();
    let publication_id = upsert.publication.id;

    let epub = repo::upsert_acquisition(
        &mut conn,
        &AcquisitionInput {
            publication_id,
            media_type: "application/epub+zip".to_string(),
            canonical_url: "https://books.example.com/download/book-1.epub".to_string(),
        },
    )
    .unwrap();
    assert!(epub.created);

    let pdf = repo::upsert_acquisition(
        &mut conn,
        &AcquisitionInput {
            publication_id,
            media_type: "application/pdf".to_string(),
            canonical_url: "https://books.example.com/download/book-1.pdf".to_string(),
        },
    )
    .unwrap();
    assert!(pdf.created);
    assert_ne!(pdf.acquisition.id, epub.acquisition.id);

    let epub_again = repo::upsert_acquisition(
        &mut conn,
        &AcquisitionInput {
            publication_id,
            media_type: "application/epub+zip".to_string(),
            canonical_url: "https://books.example.com/download/book-1-v2.epub".to_string(),
        },
    )
    .unwrap();
    assert!(!epub_again.created);
    assert_eq!(epub_again.acquisition.id, epub.acquisition.id);
    assert_eq!(
        epub_again.acquisition.canonical_url,
        "https://books.example.com/download/book-1-v2.epub"
    );

    let acquisitions = repo::list_acquisitions(&conn, publication_id).unwrap();
    assert_eq!(acquisitions.len(), 2);

    let epub_revision = repo::create_file_revision(
        &mut conn,
        &RevisionInput {
            acquisition_id: epub.acquisition.id,
            expected_length: Some(1024),
            expected_hash: Some("abc123".to_string()),
            hash_algorithm: Some("sha256".to_string()),
            local_relative_path: None,
        },
    )
    .unwrap();
    assert_eq!(epub_revision.expected_length, Some(1024));
    assert_eq!(epub_revision.expected_hash.as_deref(), Some("abc123"));
    assert_eq!(epub_revision.hash_algorithm.as_deref(), Some("sha256"));

    let pdf_revision = repo::create_file_revision(
        &mut conn,
        &RevisionInput {
            acquisition_id: pdf.acquisition.id,
            expected_length: None,
            expected_hash: None,
            hash_algorithm: None,
            local_relative_path: None,
        },
    )
    .unwrap();
    assert_eq!(pdf_revision.expected_length, None);

    let attached = repo::attach_revision_local_path(
        &conn,
        epub_revision.id,
        "books.example.com/alice/book-1/rev-1/book-1.epub",
    )
    .unwrap();
    assert!(attached);
    let current = repo::current_revision(&conn, epub.acquisition.id)
        .unwrap()
        .unwrap();
    assert_eq!(current.id, epub_revision.id);
    assert_eq!(
        current.local_relative_path.as_deref(),
        Some("books.example.com/alice/book-1/rev-1/book-1.epub")
    );
    assert!(repo::current_revision(&conn, pdf.acquisition.id)
        .unwrap()
        .is_some());

    let mismatch = repo::create_file_revision(
        &mut conn,
        &RevisionInput {
            acquisition_id: pdf.acquisition.id,
            expected_length: None,
            expected_hash: Some("abc123".to_string()),
            hash_algorithm: None,
            local_relative_path: None,
        },
    )
    .unwrap_err();
    assert!(matches!(mismatch, PersistError::Invalid(_)));
}

#[test]
fn restart_marks_active_jobs_interrupted() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("client.db");

    let mut conn = Connection::open(&db_path).unwrap();
    schema::ensure_runtime_pragmas(&conn).unwrap();
    schema::run_migrations(&mut conn).unwrap();

    let account =
        repo::ensure_catalog_account(&conn, "grimmory", "https://books.example.com", "alice")
            .unwrap();
    let upsert =
        repo::upsert_publication(&mut conn, &publication_input(account.id, "book-1", "First"))
            .unwrap();
    let acquisition = repo::upsert_acquisition(
        &mut conn,
        &AcquisitionInput {
            publication_id: upsert.publication.id,
            media_type: "application/epub+zip".to_string(),
            canonical_url: "https://books.example.com/download/book-1.epub".to_string(),
        },
    )
    .unwrap();
    let revision = repo::create_file_revision(
        &mut conn,
        &RevisionInput {
            acquisition_id: acquisition.acquisition.id,
            expected_length: Some(2048),
            expected_hash: Some("deadbeef".to_string()),
            hash_algorithm: Some("sha256".to_string()),
            local_relative_path: None,
        },
    )
    .unwrap();

    let job = repo::create_download_job(&conn, revision.id).unwrap();
    assert_eq!(job.state, JobState::Queued);
    assert!(repo::set_job_state(&conn, job.id, JobState::Running, None).unwrap());
    assert!(repo::get_job(&conn, job.id).unwrap().unwrap().started_at.is_some());

    drop(conn);

    let mut conn = Connection::open(&db_path).unwrap();
    schema::ensure_runtime_pragmas(&conn).unwrap();
    schema::run_migrations(&mut conn).unwrap();
    assert_eq!(repo::active_jobs(&conn).unwrap().len(), 1);

    assert_eq!(repo::recover_interrupted_jobs(&conn).unwrap(), 1);
    let recovered = repo::get_job(&conn, job.id).unwrap().unwrap();
    assert_eq!(recovered.state, JobState::Interrupted);
    assert_eq!(
        recovered.error.as_deref(),
        Some("interrupted by application restart")
    );
    assert!(repo::active_jobs(&conn).unwrap().is_empty());

    assert!(!repo::set_job_state(&conn, job.id, JobState::Failed, Some("retry")).unwrap());

    let retry = repo::create_download_job(&conn, revision.id).unwrap();
    assert!(repo::set_job_state(&conn, retry.id, JobState::Running, None).unwrap());
    assert!(
        repo::set_job_state(&conn, retry.id, JobState::Completed, None).unwrap()
    );
    let completed = repo::get_job(&conn, retry.id).unwrap().unwrap();
    assert_eq!(completed.state, JobState::Completed);
    assert!(completed.finished_at.is_some());

    let history = repo::jobs_for_revision(&conn, revision.id).unwrap();
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].state, JobState::Interrupted);
    assert_eq!(history[1].state, JobState::Completed);
}

#[test]
fn stale_terminal_jobs_are_purged() {
    let mut conn = migrated_conn();
    let account =
        repo::ensure_catalog_account(&conn, "grimmory", "https://books.example.com", "alice")
            .unwrap();
    let upsert =
        repo::upsert_publication(&mut conn, &publication_input(account.id, "book-1", "First"))
            .unwrap();
    let acquisition = repo::upsert_acquisition(
        &mut conn,
        &AcquisitionInput {
            publication_id: upsert.publication.id,
            media_type: "application/epub+zip".to_string(),
            canonical_url: "https://books.example.com/download/book-1.epub".to_string(),
        },
    )
    .unwrap();
    let revision = repo::create_file_revision(
        &mut conn,
        &RevisionInput {
            acquisition_id: acquisition.acquisition.id,
            expected_length: None,
            expected_hash: None,
            hash_algorithm: None,
            local_relative_path: None,
        },
    )
    .unwrap();

    let now = repo::now_unix();
    let stale_completed = repo::create_download_job(&conn, revision.id).unwrap();
    let stale_cancelled = repo::create_download_job(&conn, revision.id).unwrap();
    let recent_completed = repo::create_download_job(&conn, revision.id).unwrap();
    let still_running = repo::create_download_job(&conn, revision.id).unwrap();

    assert!(repo::set_job_state(&conn, stale_completed.id, JobState::Running, None).unwrap());
    assert!(repo::set_job_state(&conn, stale_completed.id, JobState::Completed, None).unwrap());
    assert!(repo::set_job_state(&conn, stale_cancelled.id, JobState::Cancelled, None).unwrap());
    assert!(repo::set_job_state(&conn, recent_completed.id, JobState::Running, None).unwrap());
    assert!(repo::set_job_state(&conn, recent_completed.id, JobState::Completed, None).unwrap());
    assert!(repo::set_job_state(&conn, still_running.id, JobState::Running, None).unwrap());

    for job_id in [stale_completed.id, stale_cancelled.id, still_running.id] {
        conn.execute(
            "UPDATE download_job SET updated_at = ?1 WHERE id = ?2",
            params![now - 10_000, job_id],
        )
        .unwrap();
    }

    let removed = repo::purge_stale_jobs(&conn, now - 5_000).unwrap();
    assert_eq!(removed, 2);

    let remaining = repo::jobs_for_revision(&conn, revision.id).unwrap();
    let remaining_ids: Vec<i64> = remaining.iter().map(|job| job.id).collect();
    assert_eq!(remaining.len(), 2);
    assert!(remaining_ids.contains(&recent_completed.id));
    assert!(remaining_ids.contains(&still_running.id));
    assert_eq!(
        repo::get_job(&conn, still_running.id).unwrap().unwrap().state,
        JobState::Running
    );
}

#[test]
fn relative_path_validation_rejects_escape() {
    assert_eq!(
        repo::validate_relative_path("books.example.com/alice/book.epub").unwrap(),
        "books.example.com/alice/book.epub"
    );
    assert!(repo::validate_relative_path("").is_err());
    assert!(repo::validate_relative_path("/absolute/book.epub").is_err());
    assert!(repo::validate_relative_path("../escape/book.epub").is_err());
    assert_eq!(
        repo::validate_relative_path("books/./book.epub").unwrap(),
        "books/book.epub"
    );
    assert!(repo::validate_relative_path("books/../book.epub").is_err());
    assert!(repo::validate_relative_path("books\\book.epub").is_err());
}

#[test]
fn download_job_requires_existing_revision() {
    let conn = migrated_conn();
    let err = repo::create_download_job(&conn, 999).unwrap_err();
    assert!(matches!(err, PersistError::Invalid(_)));
}

struct SnapshotFixture {
    conn: Connection,
    publication_id: i64,
    acquisition_id: i64,
}

fn snapshot_fixture() -> SnapshotFixture {
    let mut conn = migrated_conn();
    let account =
        repo::ensure_catalog_account(&conn, "grimmory", "https://books.example.com", "alice")
            .unwrap();
    let upsert =
        repo::upsert_publication(&mut conn, &publication_input(account.id, "book-1", "First"))
            .unwrap();
    let acquisition = repo::upsert_acquisition(
        &mut conn,
        &AcquisitionInput {
            publication_id: upsert.publication.id,
            media_type: "application/epub+zip".to_string(),
            canonical_url: "https://books.example.com/download/book-1.epub".to_string(),
        },
    )
    .unwrap();
    SnapshotFixture {
        conn,
        publication_id: upsert.publication.id,
        acquisition_id: acquisition.acquisition.id,
    }
}

fn completed_download(fixture: &mut SnapshotFixture, relative_path: &str) -> StoredDownloadJob {
    let revision = repo::create_file_revision(
        &mut fixture.conn,
        &RevisionInput {
            acquisition_id: fixture.acquisition_id,
            expected_length: None,
            expected_hash: None,
            hash_algorithm: None,
            local_relative_path: None,
        },
    )
    .unwrap();
    let job = repo::create_download_job(&fixture.conn, revision.id).unwrap();
    assert!(repo::set_job_state(&fixture.conn, job.id, JobState::Running, None).unwrap());
    repo::complete_download(&mut fixture.conn, revision.id, relative_path, job.id).unwrap()
}

#[test]
fn classify_covers_all_record_states() {
    use super::model::LibrarySection;

    assert_eq!(
        repo::classify_library_record(true, true, true, Some(JobState::Completed)),
        Some(LibrarySection::Complete)
    );
    assert_eq!(
        repo::classify_library_record(true, false, true, Some(JobState::Completed)),
        Some(LibrarySection::Superseded),
        "an older revision with a local file is superseded"
    );
    assert_eq!(
        repo::classify_library_record(false, false, true, Some(JobState::Completed)),
        Some(LibrarySection::Superseded),
        "a superseded revision keeps its section even when reconciliation marked \
         the publication unavailable"
    );
    assert_eq!(
        repo::classify_library_record(true, true, false, Some(JobState::Running)),
        Some(LibrarySection::Downloading)
    );
    assert_eq!(
        repo::classify_library_record(true, true, false, Some(JobState::Failed)),
        Some(LibrarySection::Failed)
    );
    assert_eq!(
        repo::classify_library_record(false, true, true, Some(JobState::Completed)),
        Some(LibrarySection::Unavailable)
    );
    assert_eq!(
        repo::classify_library_record(true, false, false, Some(JobState::Completed)),
        None,
        "current revision without a local file and without an active failure is not listed"
    );
}

#[test]
fn library_snapshot_groups_records_by_state() {
    let mut fixture = snapshot_fixture();

    // A superseded older revision that also had a local file.
    let old_revision = repo::create_file_revision(
        &mut fixture.conn,
        &RevisionInput {
            acquisition_id: fixture.acquisition_id,
            expected_length: None,
            expected_hash: None,
            hash_algorithm: None,
            local_relative_path: Some("books/book-1-old.epub".to_string()),
        },
    )
    .unwrap();

    // Complete download of the current revision.
    let complete_job = completed_download(&mut fixture, "books/book-1.epub");
    assert!(complete_job.revision_id > old_revision.id);

    let snapshot = repo::library_snapshot(&fixture.conn).unwrap();
    assert_eq!(snapshot.complete.len(), 1);
    assert_eq!(snapshot.complete[0].revision_id, complete_job.revision_id);
    assert!(snapshot.complete[0].is_current_revision);
    assert_eq!(
        snapshot.complete[0].local_relative_path.as_deref(),
        Some("books/book-1.epub")
    );
    assert_eq!(snapshot.superseded.len(), 1);
    assert_eq!(snapshot.superseded[0].revision_id, old_revision.id);
    assert!(!snapshot.superseded[0].is_current_revision);
    assert!(snapshot.downloading.is_empty());
    assert!(snapshot.failed.is_empty());
    assert!(snapshot.unavailable.is_empty());

    // A new running job for a fresh revision shows as downloading.
    let revision = repo::create_file_revision(
        &mut fixture.conn,
        &RevisionInput {
            acquisition_id: fixture.acquisition_id,
            expected_length: None,
            expected_hash: None,
            hash_algorithm: None,
            local_relative_path: None,
        },
    )
    .unwrap();
    let job = repo::create_download_job(&fixture.conn, revision.id).unwrap();
    assert!(repo::set_job_state(&fixture.conn, job.id, JobState::Running, None).unwrap());

    let snapshot = repo::library_snapshot(&fixture.conn).unwrap();
    assert_eq!(snapshot.downloading.len(), 1);
    assert_eq!(snapshot.downloading[0].revision_id, revision.id);
    assert_eq!(snapshot.downloading[0].job_state, Some(JobState::Running));

    // Failing the job moves it into the failed section.
    assert!(
        repo::set_job_state(&fixture.conn, job.id, JobState::Failed, Some("boom")).unwrap()
    );
    let snapshot = repo::library_snapshot(&fixture.conn).unwrap();
    assert!(snapshot.downloading.is_empty());
    assert_eq!(snapshot.failed.len(), 1);
    assert_eq!(snapshot.failed[0].job_error.as_deref(), Some("boom"));
}

#[test]
fn server_removal_marks_records_unavailable_without_touching_local_paths() {
    let mut fixture = snapshot_fixture();
    let job = completed_download(&mut fixture, "books/book-1.epub");
    drop(job);

    assert!(repo::set_publication_available(&fixture.conn, fixture.publication_id, false).unwrap());

    let snapshot = repo::library_snapshot(&fixture.conn).unwrap();
    assert!(snapshot.complete.is_empty());
    assert_eq!(snapshot.unavailable.len(), 1);
    assert!(!snapshot.unavailable[0].publication_available);
    assert_eq!(
        snapshot.unavailable[0].local_relative_path.as_deref(),
        Some("books/book-1.epub"),
        "local path must survive server removal"
    );
}

#[test]
fn clear_revision_local_path_forgets_deleted_files() {
    let mut fixture = snapshot_fixture();
    let job = completed_download(&mut fixture, "books/book-1.epub");

    assert!(repo::clear_revision_local_path(&fixture.conn, job.revision_id).unwrap());
    let revision = repo::get_revision(&fixture.conn, job.revision_id)
        .unwrap()
        .unwrap();
    assert!(revision.local_relative_path.is_none());

    let snapshot = repo::library_snapshot(&fixture.conn).unwrap();
    assert!(
        snapshot.complete.is_empty() && snapshot.failed.is_empty(),
        "a deleted current revision should not be listed"
    );
}

#[tokio::test]
async fn migration_preserves_legacy_rows_as_unavailable() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("shelfsync_client.db");
    let first_account_id: i64;

    {
        let legacy = Connection::open(&db_path).unwrap();
        legacy
            .execute(
                "CREATE TABLE books (
                    id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    authors TEXT NOT NULL,
                    remote_id INTEGER UNIQUE,
                    format TEXT,
                    local_path TEXT,
                    read_status TEXT DEFAULT 'unread',
                    cover_local_path TEXT,
                    series TEXT,
                    series_index REAL,
                    tags TEXT,
                    publisher TEXT,
                    description TEXT,
                    rating REAL,
                    language TEXT,
                    published_date TEXT
                )",
                [],
            )
            .unwrap();
        legacy
            .execute(
                "INSERT INTO books (id, title, authors, remote_id, local_path)
                 VALUES (1, 'Legacy One', 'Author A', 11, '/library/legacy-one.epub')",
                [],
            )
            .unwrap();
        legacy
            .execute(
                "INSERT INTO books (id, title, authors, remote_id, local_path, read_status)
                 VALUES (2, 'Legacy Two', 'Author B', 12, '/library/legacy-two.epub', 'read')",
                [],
            )
            .unwrap();
    }

    {
        let store = LibraryStore::open(&db_path).await.unwrap();
        let account = store
            .ensure_catalog_account(
                "grimmory".to_string(),
                "https://books.example.com".to_string(),
                "alice".to_string(),
            )
            .await
            .unwrap();
        first_account_id = account.id;
        let upsert = store
            .upsert_publication(publication_input(account.id, "book-1", "New Model Book"))
            .await
            .unwrap();
        assert!(upsert.created);
        assert_eq!(upsert.publication.id, 1);
    }

    {
        let conn = Connection::open(&db_path).unwrap();
        assert_eq!(count(&conn, "books"), 2);
        let legacy_row: (i64, String, String, Option<i64>, Option<String>) = conn
            .query_row(
                "SELECT id, title, authors, remote_id, local_path FROM books WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();
        assert_eq!(legacy_row.0, 1);
        assert_eq!(legacy_row.1, "Legacy One");
        assert_eq!(legacy_row.2, "Author A");
        assert_eq!(legacy_row.3, Some(11));
        assert_eq!(legacy_row.4.as_deref(), Some("/library/legacy-one.epub"));

        let status: String = conn
            .query_row("SELECT read_status FROM books WHERE id = 2", [], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "read");

        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);

        for table in [
            "catalog_account",
            "publication",
            "acquisition",
            "file_revision",
            "download_job",
            "persist_meta",
        ] {
            assert!(
                table_exists(&conn, table),
                "table {table} should exist after migration"
            );
        }

        assert_eq!(count(&conn, "publication"), 1);
        assert_eq!(count(&conn, "catalog_account"), 1);
        assert_eq!(count(&conn, "acquisition"), 0);

        let legacy_rows: String = schema::meta_value(&conn, "legacy.books.rows")
            .unwrap()
            .unwrap();
        assert_eq!(legacy_rows, "2");
        let legacy_status = schema::meta_value(&conn, "legacy.books.status")
            .unwrap()
            .unwrap();
        assert_eq!(legacy_status, "unavailable_in_new_model");
    }

    {
        let store = LibraryStore::open(&db_path).await.unwrap();
        let account_again = store
            .ensure_catalog_account(
                "grimmory".to_string(),
                "https://books.example.com".to_string(),
                "alice".to_string(),
            )
            .await
            .unwrap();
        let refetched = store
            .find_publication(
                account_again.id,
                "grimmory".to_string(),
                "book-1".to_string(),
            )
            .await
            .unwrap();
        assert!(refetched.is_some());
        assert_eq!(account_again.id, first_account_id);
    }

    {
        let conn = Connection::open(&db_path).unwrap();
        assert_eq!(count(&conn, "books"), 2);
        assert_eq!(count(&conn, "publication"), 1);
        assert_eq!(count(&conn, "catalog_account"), 1);
    }
}

fn table_exists(conn: &Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
        params![name],
        |_| Ok(()),
    )
    .optional()
    .unwrap()
    .is_some()
}
