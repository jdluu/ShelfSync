mod error;
mod model;
mod repo;
mod schema;
mod store;

#[cfg(test)]
mod tests;

pub use error::PersistError;
pub use model::{
    AcquisitionInput, AcquisitionUpsert, CatalogAccount, JobState, PublicationInput,
    PublicationUpsert, RevisionInput, StoredAcquisition, StoredDownloadJob, StoredFileRevision,
    StoredPublication,
};
pub use repo::{
    active_jobs, attach_revision_local_path, create_download_job, create_file_revision,
    current_revision, ensure_catalog_account, find_publication, get_job, get_publication,
    jobs_for_revision, list_acquisitions, purge_stale_jobs, recover_interrupted_jobs,
    set_job_state, set_publication_available, upsert_acquisition, upsert_publication,
    validate_relative_path,
};
pub use schema::{ensure_runtime_pragmas, meta_value, run_migrations, CURRENT_SCHEMA_VERSION};
pub use store::LibraryStore;
