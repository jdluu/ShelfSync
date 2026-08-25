use std::path::{Component, Path};

use rusqlite::Connection;

use super::error::PersistError;
use super::grouping;
use super::model::{
    AcquisitionInput, AcquisitionUpsert, CatalogAccount, JobState, LibrarySection, LibrarySnapshot,
    PublicationInput, PublicationUpsert, RevisionInput, StoredAcquisition, StoredDownloadJob,
    StoredFileRevision, StoredPublication,
};
use super::queries;

pub use queries::now_unix;

const MAX_METADATA_JSON_BYTES: usize = 256 * 1024;

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
    let value: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| PersistError::InvalidMetadata(e.to_string()))?;
    serde_json::to_string(&value).map_err(|e| PersistError::InvalidMetadata(e.to_string()))
}

fn normalize_canonical_url(raw: &str) -> Result<String, PersistError> {
    let trimmed = raw.trim();
    let parsed = url::Url::parse(trimmed).map_err(|_| PersistError::InvalidUrl(raw.to_string()))?;
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

    queries::insert_catalog_account_if_absent(
        conn,
        provider.trim(),
        &normalized_url,
        username.trim(),
    )?;
    queries::get_catalog_account(conn, provider.trim(), &normalized_url, username.trim())
}

pub fn get_publication(
    conn: &Connection,
    publication_id: i64,
) -> Result<Option<StoredPublication>, PersistError> {
    queries::get_publication(conn, publication_id)
}

pub fn find_publication(
    conn: &Connection,
    account_id: i64,
    provider: &str,
    canonical_id: &str,
) -> Result<Option<StoredPublication>, PersistError> {
    queries::find_publication(conn, account_id, provider, canonical_id)
}

pub fn upsert_publication(
    conn: &mut Connection,
    input: &PublicationInput,
) -> Result<PublicationUpsert, PersistError> {
    require_non_empty("provider", &input.provider)?;
    require_non_empty("canonical id", &input.canonical_id)?;
    let metadata_json = normalize_metadata_json(&input.metadata_json)?;
    let existing = queries::find_publication(
        conn,
        input.account_id,
        input.provider.trim(),
        input.canonical_id.trim(),
    )?;

    let tx = conn.transaction()?;
    let created = existing.is_none();
    if let Some(current) = &existing {
        queries::update_publication_metadata(&tx, current.id, &metadata_json)?;
        let id = current.id;
        tx.commit()?;
        let publication = queries::get_publication(conn, id)?.ok_or_else(|| {
            PersistError::Invalid(format!("publication {id} vanished after update"))
        })?;
        return Ok(PublicationUpsert {
            publication,
            created,
        });
    }

    let id = queries::insert_publication(
        &tx,
        input.account_id,
        input.provider.trim(),
        input.canonical_id.trim(),
        &metadata_json,
    )?;
    tx.commit()?;
    let publication = queries::get_publication(conn, id)?
        .ok_or_else(|| PersistError::Invalid(format!("publication {id} vanished after insert")))?;
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
    queries::set_publication_available(conn, publication_id, available)
}

pub fn list_publications_for_account(
    conn: &Connection,
    account_id: i64,
) -> Result<Vec<StoredPublication>, PersistError> {
    queries::list_publications_for_account(conn, account_id)
}

pub fn list_acquisitions(
    conn: &Connection,
    publication_id: i64,
) -> Result<Vec<StoredAcquisition>, PersistError> {
    queries::list_acquisitions(conn, publication_id)
}

pub fn upsert_acquisition(
    conn: &mut Connection,
    input: &AcquisitionInput,
) -> Result<AcquisitionUpsert, PersistError> {
    validate_media_type(&input.media_type)?;
    let canonical_url = normalize_canonical_url(&input.canonical_url)?;

    let tx = conn.transaction()?;
    let existing =
        queries::find_acquisition_id(&tx, input.publication_id, input.media_type.trim())?;
    let created = existing.is_none();
    let id = match existing {
        Some(id) => {
            queries::update_acquisition_url(&tx, id, &canonical_url)?;
            id
        }
        None => queries::insert_acquisition(
            &tx,
            input.publication_id,
            input.media_type.trim(),
            &canonical_url,
        )?,
    };
    tx.commit()?;

    let acquisition = queries::get_acquisition(conn, id)?;
    Ok(AcquisitionUpsert {
        acquisition,
        created,
    })
}

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

    if !queries::acquisition_exists(conn, input.acquisition_id)? {
        return Err(PersistError::Invalid(format!(
            "acquisition {} does not exist",
            input.acquisition_id
        )));
    }

    let id = queries::insert_file_revision(conn, input, local_relative_path.as_deref())?;
    queries::required_revision(conn, id)
}

pub fn attach_revision_local_path(
    conn: &Connection,
    revision_id: i64,
    relative_path: &str,
) -> Result<bool, PersistError> {
    let normalized = validate_relative_path(relative_path)?;
    queries::set_revision_local_path(conn, revision_id, &normalized)
}

pub fn current_revision(
    conn: &Connection,
    acquisition_id: i64,
) -> Result<Option<StoredFileRevision>, PersistError> {
    queries::current_revision(conn, acquisition_id)
}

pub fn get_revision(
    conn: &Connection,
    revision_id: i64,
) -> Result<Option<StoredFileRevision>, PersistError> {
    queries::get_revision(conn, revision_id)
}

pub fn revisions_for_acquisition(
    conn: &Connection,
    acquisition_id: i64,
) -> Result<Vec<StoredFileRevision>, PersistError> {
    queries::revisions_for_acquisition(conn, acquisition_id)
}

pub fn clear_revision_local_path(
    conn: &Connection,
    revision_id: i64,
) -> Result<bool, PersistError> {
    queries::clear_revision_local_path(conn, revision_id)
}

pub fn get_job(conn: &Connection, job_id: i64) -> Result<Option<StoredDownloadJob>, PersistError> {
    queries::get_job(conn, job_id)
}

pub fn create_download_job(
    conn: &Connection,
    revision_id: i64,
) -> Result<StoredDownloadJob, PersistError> {
    queries::create_download_job(conn, revision_id)
}

pub fn set_job_state(
    conn: &Connection,
    job_id: i64,
    to: JobState,
    error: Option<&str>,
) -> Result<bool, PersistError> {
    queries::set_job_state(conn, job_id, to, error)
}

pub fn complete_download(
    conn: &mut Connection,
    revision_id: i64,
    relative_path: &str,
    job_id: i64,
) -> Result<StoredDownloadJob, PersistError> {
    let normalized = validate_relative_path(relative_path)?;
    let tx = conn.transaction()?;
    let changed = queries::set_revision_local_path(&tx, revision_id, &normalized)?;
    if !changed {
        return Err(PersistError::Invalid(format!(
            "file revision {revision_id} does not exist"
        )));
    }
    let completed = queries::set_job_state(&tx, job_id, JobState::Completed, None)?;
    if !completed {
        return Err(PersistError::Invalid(format!(
            "download job {job_id} is not active and cannot be completed"
        )));
    }
    let job = queries::get_job(&tx, job_id)?.ok_or_else(|| {
        PersistError::Invalid(format!("download job {job_id} vanished after update"))
    })?;
    tx.commit()?;
    Ok(job)
}

pub fn active_jobs(conn: &Connection) -> Result<Vec<StoredDownloadJob>, PersistError> {
    queries::active_jobs(conn)
}

pub fn jobs_for_revision(
    conn: &Connection,
    revision_id: i64,
) -> Result<Vec<StoredDownloadJob>, PersistError> {
    queries::jobs_for_revision(conn, revision_id)
}

pub fn recover_interrupted_jobs(conn: &Connection) -> Result<usize, PersistError> {
    queries::recover_interrupted_jobs(conn)
}

pub fn purge_stale_jobs(conn: &Connection, older_than_unix: i64) -> Result<usize, PersistError> {
    queries::purge_stale_jobs(conn, older_than_unix)
}

pub fn classify_library_record(
    publication_available: bool,
    is_current_revision: bool,
    has_local_file: bool,
    latest_job_state: Option<JobState>,
) -> Option<LibrarySection> {
    grouping::classify_library_record(
        publication_available,
        is_current_revision,
        has_local_file,
        latest_job_state,
    )
}

pub fn library_snapshot(conn: &Connection) -> Result<LibrarySnapshot, PersistError> {
    grouping::library_snapshot(conn)
}
