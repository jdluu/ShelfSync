use rusqlite::Connection;

use super::error::PersistError;
use super::model::{
    JobState, LibraryRecord, LibrarySection, LibrarySnapshot, StoredAcquisition, StoredDownloadJob,
    StoredFileRevision, StoredPublication,
};
use super::queries;

pub fn classify_library_record(
    publication_available: bool,
    is_current_revision: bool,
    has_local_file: bool,
    latest_job_state: Option<JobState>,
) -> Option<LibrarySection> {
    if !is_current_revision && has_local_file {
        return Some(LibrarySection::Superseded);
    }
    if !publication_available {
        return Some(LibrarySection::Unavailable);
    }
    match latest_job_state {
        Some(JobState::Queued | JobState::Running) => Some(LibrarySection::Downloading),
        Some(JobState::Failed | JobState::Interrupted | JobState::Cancelled) => {
            Some(LibrarySection::Failed)
        }
        _ if has_local_file => Some(LibrarySection::Complete),
        _ => None,
    }
}

fn record_from_parts(
    publication: &StoredPublication,
    acquisition: &StoredAcquisition,
    revision: &StoredFileRevision,
    is_current_revision: bool,
    latest_job: Option<&StoredDownloadJob>,
) -> LibraryRecord {
    LibraryRecord {
        publication_id: publication.id,
        account_id: publication.account_id,
        provider: publication.provider.clone(),
        canonical_id: publication.canonical_id.clone(),
        metadata_json: publication.metadata_json.clone(),
        publication_available: publication.available,
        acquisition_id: acquisition.id,
        media_type: acquisition.media_type.clone(),
        canonical_url: acquisition.canonical_url.clone(),
        revision_id: revision.id,
        is_current_revision,
        local_relative_path: revision.local_relative_path.clone(),
        expected_length: revision.expected_length,
        job_state: latest_job.map(|job| job.state),
        job_error: latest_job.and_then(|job| job.error.clone()),
        updated_at: revision.updated_at,
    }
}

fn push_record(snapshot: &mut LibrarySnapshot, section: LibrarySection, record: LibraryRecord) {
    match section {
        LibrarySection::Complete => snapshot.complete.push(record),
        LibrarySection::Downloading => snapshot.downloading.push(record),
        LibrarySection::Failed => snapshot.failed.push(record),
        LibrarySection::Unavailable => snapshot.unavailable.push(record),
        LibrarySection::Superseded => snapshot.superseded.push(record),
    }
}

pub fn library_snapshot(conn: &Connection) -> Result<LibrarySnapshot, PersistError> {
    let mut snapshot = LibrarySnapshot::default();
    let account_ids = queries::catalog_account_ids(conn)?;

    for account_id in account_ids {
        for publication in queries::list_publications_for_account(conn, account_id)? {
            for acquisition in queries::list_acquisitions(conn, publication.id)? {
                let revisions = queries::revisions_for_acquisition(conn, acquisition.id)?;
                let current_revision_id = revisions.iter().map(|r| r.id).max();
                for revision in &revisions {
                    let is_current = current_revision_id == Some(revision.id);
                    let latest_job = queries::latest_job_for_revision(conn, revision.id)?;
                    let section = classify_library_record(
                        publication.available,
                        is_current,
                        revision.local_relative_path.is_some(),
                        latest_job.as_ref().map(|job| job.state),
                    );
                    let Some(section) = section else {
                        continue;
                    };
                    let record = record_from_parts(
                        &publication,
                        &acquisition,
                        revision,
                        is_current,
                        latest_job.as_ref(),
                    );
                    push_record(&mut snapshot, section, record);
                }
            }
        }
    }
    Ok(snapshot)
}
