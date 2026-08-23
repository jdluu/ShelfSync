use std::path::{Component, Path};

use rusqlite::{params, Connection, OptionalExtension};

use super::error::PersistError;
use super::model::{
    AcquisitionInput, AcquisitionUpsert, CatalogAccount, JobState, PublicationInput,
    PublicationUpsert, RevisionInput, StoredAcquisition, StoredDownloadJob, StoredFileRevision,
    StoredPublication,
};

const MAX_METADATA_JSON_BYTES: usize = 256 * 1024;
const ACTIVE_JOB_STATES: &str = "('queued', 'running')";
const TERMINAL_JOB_STATES: &str = "('completed', 'failed', 'cancelled', 'interrupted')";

pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn require_non_empty(field: &str, value: &str) -> Result<(), PersistError> {
    if value.trim().is_empty() {
        return Err(PersistError::Invalid(format!("{field} must not be empty")));
    }
    Ok(())
}

fn normalize_metadata_json(raw: &str) -> Result<String, PersistError> {
    if raw.len() > MAX_METADATA_JSON_BYTES {
        return Err(PersistError::InvalidMetadata(format!(
            "metadata snapshot exceeds {MAX_METADATA_JSON_BYTES} bytes"
        )));
    }
    let value: serde_json::Value = serde_json::from_str(raw)
        .map_err(|e| PersistError::InvalidMetadata(e.to_string()))?;
    serde_json::to_string(&value).map_err(|e| PersistError::InvalidMetadata(e.to_string()))
}

fn normalize_canonical_url(raw: &str) -> Result<String, PersistError> {
    let trimmed = raw.trim();
    let parsed =
        url::Url::parse(trimmed).map_err(|_| PersistError::InvalidUrl(raw.to_string()))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.as_str().to_string()),
        _ => Err(PersistError::InvalidUrl(raw.to_string())),
    }
}

fn validate_media_type(raw: &str) -> Result<(), PersistError> {
    require_non_empty("media type", raw)?;
    if !raw.trim().contains('/') {
        return Err(PersistError::Invalid(format!(
            "media type '{raw}' is not a type/subtype pair"
        )));
    }
    Ok(())
}

pub fn validate_relative_path(raw: &str) -> Result<String, PersistError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(PersistError::UnsafePath(
            "local relative path must not be empty".to_string(),
        ));
    }
    if trimmed.contains('\\') || trimmed.starts_with('/') {
        return Err(PersistError::UnsafePath(format!(
            "path must be relative with posix separators: {raw}"
        )));
    }
    let path = Path::new(trimmed);
    let mut parts: Vec<&str> = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let part_str = part.to_str().ok_or_else(|| {
                    PersistError::UnsafePath(format!("path is not valid utf-8: {raw}"))
                })?;
                parts.push(part_str);
            }
            _ => {
                return Err(PersistError::UnsafePath(format!(
                    "path must stay inside the content root: {raw}"
                )))
            }
        }
    }
    if parts.is_empty() {
        return Err(PersistError::UnsafePath(format!(
            "path resolves to no content: {raw}"
        )));
    }
    Ok(parts.join("/"))
}

pub fn ensure_catalog_account(
    conn: &Connection,
    provider: &str,
    base_url: &str,
    username: &str,
) -> Result<CatalogAccount, PersistError> {
    require_non_empty("provider", provider)?;
    let normalized_url = normalize_canonical_url(base_url)?;
    require_non_empty("username", username)?;

    conn.execute(
        "INSERT INTO catalog_account (provider, base_url, username, created_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (provider, base_url, username) DO NOTHING",
        params![provider.trim(), normalized_url, username.trim(), now_unix()],
    )?;
    let account = conn.query_row(
        "SELECT id, provider, base_url, username FROM catalog_account
         WHERE provider = ?1 AND base_url = ?2 AND username = ?3",
        params![provider.trim(), normalized_url, username.trim()],
        |row| {
            Ok(CatalogAccount {
                id: row.get(0)?,
                provider: row.get(1)?,
                base_url: row.get(2)?,
                username: row.get(3)?,
            })
        },
    )?;
    Ok(account)
}

fn publication_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredPublication> {
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

const PUBLICATION_COLUMNS: &str =
    "id, account_id, provider, canonical_id, metadata_json, available, created_at, updated_at";

pub fn get_publication(
    conn: &Connection,
    publication_id: i64,
) -> Result<Option<StoredPublication>, PersistError> {
    let found = conn
        .query_row(
            &format!("SELECT {PUBLICATION_COLUMNS} FROM publication WHERE id = ?1"),
            params![publication_id],
            publication_from_row,
        )
        .optional()?;
    Ok(found)
}

pub fn find_publication(
    conn: &Connection,
    account_id: i64,
    provider: &str,
    canonical_id: &str,
) -> Result<Option<StoredPublication>, PersistError> {
    let found = conn
        .query_row(
            &format!(
                "SELECT {PUBLICATION_COLUMNS} FROM publication
                 WHERE account_id = ?1 AND provider = ?2 AND canonical_id = ?3"
            ),
            params![account_id, provider, canonical_id],
            publication_from_row,
        )
        .optional()?;
    Ok(found)
}

pub fn upsert_publication(
    conn: &mut Connection,
    input: &PublicationInput,
) -> Result<PublicationUpsert, PersistError> {
    require_non_empty("provider", &input.provider)?;
    require_non_empty("canonical id", &input.canonical_id)?;
    let metadata_json = normalize_metadata_json(&input.metadata_json)?;
    let existing = find_publication(
        conn,
        input.account_id,
        input.provider.trim(),
        input.canonical_id.trim(),
    )?;

    let tx = conn.transaction()?;
    let created = existing.is_none();
    if let Some(current) = &existing {
        tx.execute(
            "UPDATE publication
             SET metadata_json = ?1, available = 1, updated_at = ?2
             WHERE id = ?3",
            params![metadata_json, now_unix(), current.id],
        )?;
        let id = current.id;
        tx.commit()?;
        let publication = get_publication(conn, id)?.ok_or_else(|| {
            PersistError::Invalid(format!("publication {id} vanished after update"))
        })?;
        return Ok(PublicationUpsert {
            publication,
            created,
        });
    }

    tx.execute(
        "INSERT INTO publication (account_id, provider, canonical_id, metadata_json, available, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
        params![
            input.account_id,
            input.provider.trim(),
            input.canonical_id.trim(),
            metadata_json,
            now_unix()
        ],
    )?;
    let id = tx.last_insert_rowid();
    tx.commit()?;
    let publication = get_publication(conn, id)?.ok_or_else(|| {
        PersistError::Invalid(format!("publication {id} vanished after insert"))
    })?;
    Ok(PublicationUpsert {
        publication,
        created,
    })
}

pub fn set_publication_available(
    conn: &Connection,
    publication_id: i64,
    available: bool,
) -> Result<bool, PersistError> {
    let changed = conn.execute(
        "UPDATE publication SET available = ?1, updated_at = ?2 WHERE id = ?3",
        params![available as i64, now_unix(), publication_id],
    )?;
    Ok(changed == 1)
}

fn acquisition_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredAcquisition> {
    Ok(StoredAcquisition {
        id: row.get(0)?,
        publication_id: row.get(1)?,
        media_type: row.get(2)?,
        canonical_url: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

const ACQUISITION_COLUMNS: &str = "id, publication_id, media_type, canonical_url, created_at, updated_at";

pub fn list_acquisitions(
    conn: &Connection,
    publication_id: i64,
) -> Result<Vec<StoredAcquisition>, PersistError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {ACQUISITION_COLUMNS} FROM acquisition WHERE publication_id = ?1 ORDER BY id"
    ))?;
    let rows = stmt.query_map(params![publication_id], acquisition_from_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn upsert_acquisition(
    conn: &mut Connection,
    input: &AcquisitionInput,
) -> Result<AcquisitionUpsert, PersistError> {
    validate_media_type(&input.media_type)?;
    let canonical_url = normalize_canonical_url(&input.canonical_url)?;

    let tx = conn.transaction()?;
    let existing: Option<i64> = tx
        .query_row(
            "SELECT id FROM acquisition WHERE publication_id = ?1 AND media_type = ?2",
            params![input.publication_id, input.media_type.trim()],
            |row| row.get(0),
        )
        .optional()?;
    let created = existing.is_none();
    let id = match existing {
        Some(id) => {
            tx.execute(
                "UPDATE acquisition SET canonical_url = ?1, updated_at = ?2 WHERE id = ?3",
                params![canonical_url, now_unix(), id],
            )?;
            id
        }
        None => {
            tx.execute(
                "INSERT INTO acquisition (publication_id, media_type, canonical_url, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)",
                params![input.publication_id, input.media_type.trim(), canonical_url, now_unix()],
            )?;
            tx.last_insert_rowid()
        }
    };
    tx.commit()?;

    let acquisition = conn
        .query_row(
            &format!("SELECT {ACQUISITION_COLUMNS} FROM acquisition WHERE id = ?1"),
            params![id],
            acquisition_from_row,
        )?;
    Ok(AcquisitionUpsert {
        acquisition,
        created,
    })
}

fn revision_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredFileRevision> {
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

const REVISION_COLUMNS: &str =
    "id, acquisition_id, expected_length, expected_hash, hash_algorithm, local_relative_path, created_at, updated_at";

pub fn create_file_revision(
    conn: &mut Connection,
    input: &RevisionInput,
) -> Result<StoredFileRevision, PersistError> {
    match (&input.expected_hash, &input.hash_algorithm) {
        (Some(hash), Some(_)) => require_non_empty("expected hash", hash)?,
        (None, None) => {}
        _ => {
            return Err(PersistError::Invalid(
                "expected hash and hash algorithm must be provided together".to_string(),
            ))
        }
    }
    let local_relative_path = match &input.local_relative_path {
        Some(path) => Some(validate_relative_path(path)?),
        None => None,
    };

    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM acquisition WHERE id = ?1",
            params![input.acquisition_id],
            |row| row.get(0),
        )
        .optional()?;
    if exists.is_none() {
        return Err(PersistError::Invalid(format!(
            "acquisition {} does not exist",
            input.acquisition_id
        )));
    }

    let now = now_unix();
    conn.execute(
        "INSERT INTO file_revision (acquisition_id, expected_length, expected_hash, hash_algorithm, local_relative_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            input.acquisition_id,
            input.expected_length,
            input.expected_hash,
            input.hash_algorithm,
            local_relative_path,
            now
        ],
    )?;
    let id = conn.last_insert_rowid();
    let revision = conn.query_row(
        &format!("SELECT {REVISION_COLUMNS} FROM file_revision WHERE id = ?1"),
        params![id],
        revision_from_row,
    )?;
    Ok(revision)
}

pub fn attach_revision_local_path(
    conn: &Connection,
    revision_id: i64,
    relative_path: &str,
) -> Result<bool, PersistError> {
    let normalized = validate_relative_path(relative_path)?;
    let changed = conn.execute(
        "UPDATE file_revision SET local_relative_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![normalized, now_unix(), revision_id],
    )?;
    Ok(changed == 1)
}

pub fn current_revision(
    conn: &Connection,
    acquisition_id: i64,
) -> Result<Option<StoredFileRevision>, PersistError> {
    let found = conn
        .query_row(
            &format!(
                "SELECT {REVISION_COLUMNS} FROM file_revision
                 WHERE acquisition_id = ?1 ORDER BY id DESC LIMIT 1"
            ),
            params![acquisition_id],
            revision_from_row,
        )
        .optional()?;
    Ok(found)
}

fn job_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredDownloadJob> {
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

const JOB_COLUMNS: &str =
    "id, revision_id, state, error, created_at, updated_at, started_at, finished_at";

pub fn get_job(
    conn: &Connection,
    job_id: i64,
) -> Result<Option<StoredDownloadJob>, PersistError> {
    let found = conn
        .query_row(
            &format!("SELECT {JOB_COLUMNS} FROM download_job WHERE id = ?1"),
            params![job_id],
            job_from_row,
        )
        .optional()?;
    Ok(found)
}

pub fn create_download_job(
    conn: &Connection,
    revision_id: i64,
) -> Result<StoredDownloadJob, PersistError> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM file_revision WHERE id = ?1",
            params![revision_id],
            |row| row.get(0),
        )
        .optional()?;
    if exists.is_none() {
        return Err(PersistError::Invalid(format!(
            "file revision {revision_id} does not exist"
        )));
    }
    let now = now_unix();
    conn.execute(
        "INSERT INTO download_job (revision_id, state, created_at, updated_at)
         VALUES (?1, 'queued', ?2, ?2)",
        params![revision_id, now],
    )?;
    let id = conn.last_insert_rowid();
    let job = conn.query_row(
        &format!("SELECT {JOB_COLUMNS} FROM download_job WHERE id = ?1"),
        params![id],
        job_from_row,
    )?;
    Ok(job)
}

pub fn set_job_state(
    conn: &Connection,
    job_id: i64,
    to: JobState,
    error: Option<&str>,
) -> Result<bool, PersistError> {
    let now = now_unix();
    let sql = format!(
        "UPDATE download_job
         SET state = ?2,
             updated_at = ?3,
             started_at = COALESCE(started_at, CASE WHEN ?2 = 'running' THEN ?3 END),
             finished_at = CASE WHEN ?2 IN {TERMINAL_JOB_STATES} THEN ?3 ELSE finished_at END,
             error = COALESCE(?4, error)
         WHERE id = ?1 AND state IN {ACTIVE_JOB_STATES}"
    );
    let changed = conn.execute(&sql, params![job_id, to.as_str(), now, error])?;
    Ok(changed == 1)
}

pub fn complete_download(
    conn: &mut Connection,
    revision_id: i64,
    relative_path: &str,
    job_id: i64,
) -> Result<StoredDownloadJob, PersistError> {
    let normalized = validate_relative_path(relative_path)?;
    let tx = conn.transaction()?;
    let changed = tx.execute(
        "UPDATE file_revision SET local_relative_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![normalized, now_unix(), revision_id],
    )?;
    if changed != 1 {
        return Err(PersistError::Invalid(format!(
            "file revision {revision_id} does not exist"
        )));
    }
    let completed = set_job_state(&tx, job_id, JobState::Completed, None)?;
    if !completed {
        return Err(PersistError::Invalid(format!(
            "download job {job_id} is not active and cannot be completed"
        )));
    }
    let job = get_job(&tx, job_id)?.ok_or_else(|| {
        PersistError::Invalid(format!("download job {job_id} vanished after update"))
    })?;
    tx.commit()?;
    Ok(job)
}

pub fn active_jobs(conn: &Connection) -> Result<Vec<StoredDownloadJob>, PersistError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {JOB_COLUMNS} FROM download_job WHERE state IN {ACTIVE_JOB_STATES} ORDER BY id"
    ))?;
    let rows = stmt.query_map([], job_from_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn jobs_for_revision(
    conn: &Connection,
    revision_id: i64,
) -> Result<Vec<StoredDownloadJob>, PersistError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {JOB_COLUMNS} FROM download_job WHERE revision_id = ?1 ORDER BY id"
    ))?;
    let rows = stmt.query_map(params![revision_id], job_from_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn recover_interrupted_jobs(conn: &Connection) -> Result<usize, PersistError> {
    let now = now_unix();
    let changed = conn.execute(
        &format!(
            "UPDATE download_job
             SET state = 'interrupted',
                 updated_at = ?1,
                 finished_at = COALESCE(finished_at, ?1),
                 error = COALESCE(error, 'interrupted by application restart')
             WHERE state IN {ACTIVE_JOB_STATES}"
        ),
        params![now],
    )?;
    Ok(changed)
}

pub fn purge_stale_jobs(conn: &Connection, older_than_unix: i64) -> Result<usize, PersistError> {
    let removed = conn.execute(
        &format!(
            "DELETE FROM download_job
             WHERE state IN {TERMINAL_JOB_STATES} AND updated_at < ?1"
        ),
        params![older_than_unix],
    )?;
    Ok(removed)
}
