use rusqlite::Row;

use super::model::{
    CatalogAccount, JobState, StoredAcquisition, StoredDownloadJob, StoredFileRevision,
    StoredPublication,
};

pub const CATALOG_ACCOUNT_COLUMNS: &str = "id, provider, base_url, username";
pub const PUBLICATION_COLUMNS: &str =
    "id, account_id, provider, canonical_id, metadata_json, available, created_at, updated_at";
pub const ACQUISITION_COLUMNS: &str =
    "id, publication_id, media_type, canonical_url, created_at, updated_at";
pub const REVISION_COLUMNS: &str =
    "id, acquisition_id, expected_length, expected_hash, hash_algorithm, local_relative_path, created_at, updated_at";
pub const JOB_COLUMNS: &str =
    "id, revision_id, state, error, created_at, updated_at, started_at, finished_at";

pub fn row_to_catalog_account(row: &Row<'_>) -> rusqlite::Result<CatalogAccount> {
    Ok(CatalogAccount {
        id: row.get(0)?,
        provider: row.get(1)?,
        base_url: row.get(2)?,
        username: row.get(3)?,
    })
}

pub fn row_to_publication(row: &Row<'_>) -> rusqlite::Result<StoredPublication> {
    Ok(StoredPublication {
        id: row.get(0)?,
        account_id: row.get(1)?,
        provider: row.get(2)?,
        canonical_id: row.get(3)?,
        metadata_json: row.get(4)?,
        available: row.get::<_, i64>(5)? != 0,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub fn row_to_acquisition(row: &Row<'_>) -> rusqlite::Result<StoredAcquisition> {
    Ok(StoredAcquisition {
        id: row.get(0)?,
        publication_id: row.get(1)?,
        media_type: row.get(2)?,
        canonical_url: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

pub fn row_to_file_revision(row: &Row<'_>) -> rusqlite::Result<StoredFileRevision> {
    Ok(StoredFileRevision {
        id: row.get(0)?,
        acquisition_id: row.get(1)?,
        expected_length: row.get(2)?,
        expected_hash: row.get(3)?,
        hash_algorithm: row.get(4)?,
        local_relative_path: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub fn row_to_download_job(row: &Row<'_>) -> rusqlite::Result<StoredDownloadJob> {
    let state_raw: String = row.get(2)?;
    let state = JobState::parse(&state_raw).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            2,
            rusqlite::types::Type::Text,
            format!("unknown download job state '{state_raw}'").into(),
        )
    })?;
    Ok(StoredDownloadJob {
        id: row.get(0)?,
        revision_id: row.get(1)?,
        state,
        error: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        started_at: row.get(6)?,
        finished_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::*;
    use crate::persist::schema;

    fn migrated_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        schema::ensure_runtime_pragmas(&conn).unwrap();
        schema::run_migrations(&mut conn).unwrap();
        conn
    }

    #[test]
    fn row_to_catalog_account_maps_selected_columns() {
        let conn = migrated_conn();
        conn.execute(
            "INSERT INTO catalog_account (provider, base_url, username, created_at)
             VALUES ('grimmory', 'https://books.example.com', 'alice', 1)",
            [],
        )
        .unwrap();

        let account = conn
            .query_row(
                &format!("SELECT {CATALOG_ACCOUNT_COLUMNS} FROM catalog_account"),
                [],
                row_to_catalog_account,
            )
            .unwrap();

        assert_eq!(account.id, 1);
        assert_eq!(account.provider, "grimmory");
        assert_eq!(account.base_url, "https://books.example.com");
        assert_eq!(account.username, "alice");
    }

    #[test]
    fn row_to_publication_maps_selected_columns() {
        let conn = migrated_conn();
        conn.execute_batch(
            "INSERT INTO catalog_account (provider, base_url, username, created_at)
             VALUES ('grimmory', 'https://books.example.com', 'alice', 1);
             INSERT INTO publication (account_id, provider, canonical_id, metadata_json, available, created_at, updated_at)
             VALUES (1, 'grimmory', 'book-1', '{\"title\":\"First\"}', 0, 10, 20);",
        )
        .unwrap();

        let publication = conn
            .query_row(
                &format!("SELECT {PUBLICATION_COLUMNS} FROM publication"),
                [],
                row_to_publication,
            )
            .unwrap();

        assert_eq!(publication.id, 1);
        assert_eq!(publication.account_id, 1);
        assert_eq!(publication.provider, "grimmory");
        assert_eq!(publication.canonical_id, "book-1");
        assert_eq!(publication.metadata_json, r#"{"title":"First"}"#);
        assert!(!publication.available, "available must decode from integer");
        assert_eq!(publication.created_at, 10);
        assert_eq!(publication.updated_at, 20);
    }

    #[test]
    fn row_to_acquisition_maps_selected_columns() {
        let conn = migrated_conn();
        // Seed a real publication row so the acquisition FK is satisfied.
        conn.execute_batch(
            "INSERT INTO catalog_account (provider, base_url, username, created_at)
             VALUES ('grimmory', 'https://books.example.com', 'alice', 1);
             INSERT INTO publication (account_id, provider, canonical_id, metadata_json, available, created_at, updated_at)
             VALUES (1, 'grimmory', 'book-1', '{}', 0, 2, 3);
             INSERT INTO acquisition (publication_id, media_type, canonical_url, created_at, updated_at)
             VALUES (1, 'application/epub+zip', 'https://books.example.com/book-1.epub', 5, 6);",
        )
        .unwrap();

        let acquisition = conn
            .query_row(
                &format!("SELECT {ACQUISITION_COLUMNS} FROM acquisition"),
                [],
                row_to_acquisition,
            )
            .unwrap();

        assert_eq!(acquisition.id, 1);
        assert_eq!(acquisition.publication_id, 1);
        assert_eq!(acquisition.media_type, "application/epub+zip");
        assert_eq!(
            acquisition.canonical_url,
            "https://books.example.com/book-1.epub"
        );
        assert_eq!(acquisition.created_at, 5);
        assert_eq!(acquisition.updated_at, 6);
    }

    #[test]
    fn row_to_file_revision_maps_optional_fields() {
        let conn = migrated_conn();
        // Seed the full FK chain: account -> publication -> acquisition -> revision.
        conn.execute_batch(
            "INSERT INTO catalog_account (provider, base_url, username, created_at)
             VALUES ('grimmory', 'https://books.example.com', 'alice', 1);
             INSERT INTO publication (account_id, provider, canonical_id, metadata_json, available, created_at, updated_at)
             VALUES (1, 'grimmory', 'book-1', '{}', 0, 2, 3);
             INSERT INTO acquisition (publication_id, media_type, canonical_url, created_at, updated_at)
             VALUES (1, 'application/epub+zip', 'https://books.example.com/book-1.epub', 4, 5);
             INSERT INTO file_revision (acquisition_id, expected_length, expected_hash, hash_algorithm, local_relative_path, created_at, updated_at)
             VALUES (1, 1024, 'abc123', 'sha256', NULL, 8, 9);",
        )
        .unwrap();

        let revision = conn
            .query_row(
                &format!("SELECT {REVISION_COLUMNS} FROM file_revision"),
                [],
                row_to_file_revision,
            )
            .unwrap();

        assert_eq!(revision.id, 1);
        assert_eq!(revision.acquisition_id, 1);
        assert_eq!(revision.expected_length, Some(1024));
        assert_eq!(revision.expected_hash.as_deref(), Some("abc123"));
        assert_eq!(revision.hash_algorithm.as_deref(), Some("sha256"));
        assert!(revision.local_relative_path.is_none());
        assert_eq!(revision.created_at, 8);
        assert_eq!(revision.updated_at, 9);
    }

    #[test]
    fn row_to_download_job_maps_state_and_error() {
        let conn = migrated_conn();
        // Seed the full FK chain down to download_job.
        conn.execute_batch(
            "INSERT INTO catalog_account (provider, base_url, username, created_at)
             VALUES ('grimmory', 'https://books.example.com', 'alice', 1);
             INSERT INTO publication (account_id, provider, canonical_id, metadata_json, available, created_at, updated_at)
             VALUES (1, 'grimmory', 'book-1', '{}', 0, 2, 3);
             INSERT INTO acquisition (publication_id, media_type, canonical_url, created_at, updated_at)
             VALUES (1, 'application/epub+zip', 'https://books.example.com/book-1.epub', 4, 5);
             INSERT INTO file_revision (acquisition_id, expected_length, expected_hash, hash_algorithm, local_relative_path, created_at, updated_at)
             VALUES (1, 1024, 'abc123', 'sha256', NULL, 6, 7);
             INSERT INTO download_job (revision_id, state, error, created_at, updated_at, started_at, finished_at)
             VALUES (1, 'failed', 'boom', 11, 12, 13, 14);",
        )
        .unwrap();

        let job = conn
            .query_row(
                &format!("SELECT {JOB_COLUMNS} FROM download_job"),
                [],
                row_to_download_job,
            )
            .unwrap();

        assert_eq!(job.id, 1);
        assert_eq!(job.revision_id, 1);
        assert_eq!(job.state, JobState::Failed);
        assert_eq!(job.error.as_deref(), Some("boom"));
        assert_eq!(job.created_at, 11);
        assert_eq!(job.updated_at, 12);
        assert_eq!(job.started_at, Some(13));
        assert_eq!(job.finished_at, Some(14));
    }

    #[test]
    fn row_to_download_job_rejects_unknown_state() {
        let conn = migrated_conn();
        let mapped = conn.query_row(
            "SELECT 1 AS id, 2 AS revision_id, 'bogus' AS state, NULL AS error,
                    3 AS created_at, 4 AS updated_at, NULL AS started_at, NULL AS finished_at",
            [],
            row_to_download_job,
        );

        match mapped {
            Err(rusqlite::Error::FromSqlConversionFailure(_, _, message)) => {
                assert!(
                    message
                        .to_string()
                        .contains("unknown download job state 'bogus'"),
                    "unexpected failure message: {message}"
                );
            }
            other => panic!("expected FromSqlConversionFailure, got {other:?}"),
        }
    }

    #[test]
    fn mappers_survive_round_trip_through_repo_helpers() {
        let mut conn = migrated_conn();
        let account = crate::persist::repo::ensure_catalog_account(
            &conn,
            "grimmory",
            "https://books.example.com",
            "alice",
        )
        .unwrap();
        let upsert = crate::persist::repo::upsert_publication(
            &mut conn,
            &crate::persist::model::PublicationInput {
                account_id: account.id,
                provider: "grimmory".to_string(),
                canonical_id: "book-1".to_string(),
                metadata_json: r#"{"title":"First"}"#.to_string(),
            },
        )
        .unwrap();
        let stored = conn
            .query_row(
                &format!("SELECT {PUBLICATION_COLUMNS} FROM publication WHERE id = ?1"),
                params![upsert.publication.id],
                row_to_publication,
            )
            .unwrap();
        assert_eq!(stored, upsert.publication);
    }
}
