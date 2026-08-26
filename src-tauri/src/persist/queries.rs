use rusqlite::{params, Connection, OptionalExtension};

use super::error::PersistError;
use super::model::{
    CatalogAccount, JobState, RevisionInput, StoredAcquisition, StoredDownloadJob,
    StoredFileRevision, StoredPublication,
};
use super::row_mapper::{
    row_to_acquisition, row_to_catalog_account, row_to_download_job, row_to_file_revision,
    row_to_publication, ACQUISITION_COLUMNS, CATALOG_ACCOUNT_COLUMNS, JOB_COLUMNS,
    PUBLICATION_COLUMNS, REVISION_COLUMNS,
};

pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

const ACTIVE_JOB_STATES: &str = "('queued', 'running')";
const TERMINAL_JOB_STATES: &str = "('completed', 'failed', 'cancelled', 'interrupted')";

pub fn insert_catalog_account_if_absent(
    conn: &Connection,
    provider: &str,
    base_url: &str,
    username: &str,
) -> Result<(), PersistError> {
    conn.execute(
        "INSERT INTO catalog_account (provider, base_url, username, created_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (provider, base_url, username) DO NOTHING",
        params![provider, base_url, username, now_unix()],
    )?;
    Ok(())
}

pub fn get_catalog_account(
    conn: &Connection,
    provider: &str,
    base_url: &str,
    username: &str,
) -> Result<CatalogAccount, PersistError> {
    let account = conn.query_row(
        &format!(
            "SELECT {CATALOG_ACCOUNT_COLUMNS} FROM catalog_account
             WHERE provider = ?1 AND base_url = ?2 AND username = ?3"
        ),
        params![provider, base_url, username],
        row_to_catalog_account,
    )?;
    Ok(account)
}

pub fn get_publication(
    conn: &Connection,
    publication_id: i64,
) -> Result<Option<StoredPublication>, PersistError> {
    let found = conn
        .query_row(
            &format!("SELECT {PUBLICATION_COLUMNS} FROM publication WHERE id = ?1"),
            params![publication_id],
            row_to_publication,
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
            row_to_publication,
        )
        .optional()?;
    Ok(found)
}

pub fn update_publication_metadata(
    conn: &Connection,
    publication_id: i64,
    metadata_json: &str,
) -> Result<usize, PersistError> {
    let changed = conn.execute(
        "UPDATE publication
         SET metadata_json = ?1, available = 1, updated_at = ?2
         WHERE id = ?3",
        params![metadata_json, now_unix(), publication_id],
    )?;
    Ok(changed)
}

pub fn insert_publication(
    conn: &Connection,
    account_id: i64,
    provider: &str,
    canonical_id: &str,
    metadata_json: &str,
) -> Result<i64, PersistError> {
    conn.execute(
        "INSERT INTO publication (account_id, provider, canonical_id, metadata_json, available, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
        params![
            account_id,
            provider,
            canonical_id,
            metadata_json,
            now_unix()
        ],
    )?;
    Ok(conn.last_insert_rowid())
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

pub fn list_publications_for_account(
    conn: &Connection,
    account_id: i64,
) -> Result<Vec<StoredPublication>, PersistError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {PUBLICATION_COLUMNS} FROM publication
         WHERE account_id = ?1 ORDER BY id"
    ))?;
    let rows = stmt.query_map(params![account_id], row_to_publication)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn list_acquisitions(
    conn: &Connection,
    publication_id: i64,
) -> Result<Vec<StoredAcquisition>, PersistError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {ACQUISITION_COLUMNS} FROM acquisition WHERE publication_id = ?1 ORDER BY id"
    ))?;
    let rows = stmt.query_map(params![publication_id], row_to_acquisition)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn get_acquisition(
    conn: &Connection,
    acquisition_id: i64,
) -> Result<StoredAcquisition, PersistError> {
    let acquisition = conn.query_row(
        &format!("SELECT {ACQUISITION_COLUMNS} FROM acquisition WHERE id = ?1"),
        params![acquisition_id],
        row_to_acquisition,
    )?;
    Ok(acquisition)
}

pub fn find_acquisition_id(
    conn: &Connection,
    publication_id: i64,
    media_type: &str,
) -> Result<Option<i64>, PersistError> {
    let found = conn
        .query_row(
            "SELECT id FROM acquisition WHERE publication_id = ?1 AND media_type = ?2",
            params![publication_id, media_type],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found)
}

pub fn update_acquisition_url(
    conn: &Connection,
    acquisition_id: i64,
    canonical_url: &str,
) -> Result<usize, PersistError> {
    let changed = conn.execute(
        "UPDATE acquisition SET canonical_url = ?1, updated_at = ?2 WHERE id = ?3",
        params![canonical_url, now_unix(), acquisition_id],
    )?;
    Ok(changed)
}

pub fn insert_acquisition(
    conn: &Connection,
    publication_id: i64,
    media_type: &str,
    canonical_url: &str,
) -> Result<i64, PersistError> {
    conn.execute(
        "INSERT INTO acquisition (publication_id, media_type, canonical_url, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![publication_id, media_type, canonical_url, now_unix()],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn acquisition_exists(conn: &Connection, acquisition_id: i64) -> Result<bool, PersistError> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT id FROM acquisition WHERE id = ?1",
            params![acquisition_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

pub fn insert_file_revision(
    conn: &Connection,
    input: &RevisionInput,
    local_relative_path: Option<&str>,
) -> Result<i64, PersistError> {
    conn.execute(
        "INSERT INTO file_revision (acquisition_id, expected_length, expected_hash, hash_algorithm, local_relative_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            input.acquisition_id,
            input.expected_length,
            input.expected_hash,
            input.hash_algorithm,
            local_relative_path,
            now_unix()
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn required_revision(
    conn: &Connection,
    revision_id: i64,
) -> Result<StoredFileRevision, PersistError> {
    let revision = conn.query_row(
        &format!("SELECT {REVISION_COLUMNS} FROM file_revision WHERE id = ?1"),
        params![revision_id],
        row_to_file_revision,
    )?;
    Ok(revision)
}

pub fn set_revision_local_path(
    conn: &Connection,
    revision_id: i64,
    relative_path: &str,
) -> Result<bool, PersistError> {
    let changed = conn.execute(
        "UPDATE file_revision SET local_relative_path = ?1, updated_at = ?2 WHERE id = ?3",
        params![relative_path, now_unix(), revision_id],
    )?;
    Ok(changed == 1)
}

pub fn clear_revision_local_path(
    conn: &Connection,
    revision_id: i64,
) -> Result<bool, PersistError> {
    let changed = conn.execute(
        "UPDATE file_revision SET local_relative_path = NULL, updated_at = ?1 WHERE id = ?2",
        params![now_unix(), revision_id],
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
            row_to_file_revision,
        )
        .optional()?;
    Ok(found)
}

pub fn get_revision(
    conn: &Connection,
    revision_id: i64,
) -> Result<Option<StoredFileRevision>, PersistError> {
    let found = conn
        .query_row(
            &format!("SELECT {REVISION_COLUMNS} FROM file_revision WHERE id = ?1"),
            params![revision_id],
            row_to_file_revision,
        )
        .optional()?;
    Ok(found)
}

pub fn revisions_for_acquisition(
    conn: &Connection,
    acquisition_id: i64,
) -> Result<Vec<StoredFileRevision>, PersistError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {REVISION_COLUMNS} FROM file_revision
         WHERE acquisition_id = ?1 ORDER BY id"
    ))?;
    let rows = stmt.query_map(params![acquisition_id], row_to_file_revision)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn get_job(conn: &Connection, job_id: i64) -> Result<Option<StoredDownloadJob>, PersistError> {
    let found = conn
        .query_row(
            &format!("SELECT {JOB_COLUMNS} FROM download_job WHERE id = ?1"),
            params![job_id],
            row_to_download_job,
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
        row_to_download_job,
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

pub fn active_jobs(conn: &Connection) -> Result<Vec<StoredDownloadJob>, PersistError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {JOB_COLUMNS} FROM download_job WHERE state IN {ACTIVE_JOB_STATES} ORDER BY id"
    ))?;
    let rows = stmt.query_map([], row_to_download_job)?;
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
    let rows = stmt.query_map(params![revision_id], row_to_download_job)?;
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

pub fn latest_job_for_revision(
    conn: &Connection,
    revision_id: i64,
) -> Result<Option<StoredDownloadJob>, PersistError> {
    let found = conn
        .query_row(
            &format!(
                "SELECT {JOB_COLUMNS} FROM download_job
                 WHERE revision_id = ?1 ORDER BY id DESC LIMIT 1"
            ),
            params![revision_id],
            row_to_download_job,
        )
        .optional()?;
    Ok(found)
}

pub fn catalog_account_ids(conn: &Connection) -> Result<Vec<i64>, PersistError> {
    let mut stmt = conn.prepare("SELECT id FROM catalog_account ORDER BY id")?;
    let ids = stmt
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}
