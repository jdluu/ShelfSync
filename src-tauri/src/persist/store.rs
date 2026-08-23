use std::path::Path;

use rusqlite::Connection;
use tokio::sync::Mutex as AsyncMutex;

use super::error::PersistError;
use super::model::{
    AcquisitionInput, AcquisitionUpsert, CatalogAccount, JobState, PublicationInput,
    PublicationUpsert, RevisionInput, StoredAcquisition, StoredDownloadJob, StoredFileRevision,
    StoredPublication,
};
use super::{repo, schema};

pub struct LibraryStore {
    pool: deadpool_sqlite::Pool,
    migrate_lock: AsyncMutex<()>,
}

impl LibraryStore {
    pub async fn open(db_path: impl AsRef<Path>) -> Result<Self, PersistError> {
        let path = db_path.as_ref();
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)?;
            }
        }
        let config = deadpool_sqlite::Config::new(path);
        let pool = config
            .builder(deadpool_sqlite::Runtime::Tokio1)
            .map_err(|e| PersistError::Pool(e.to_string()))?
            .build()
            .map_err(|e| PersistError::Pool(e.to_string()))?;
        let store = Self {
            pool,
            migrate_lock: AsyncMutex::new(()),
        };
        store.migrate().await?;
        Ok(store)
    }

    pub async fn migrate(&self) -> Result<(), PersistError> {
        let _guard = self.migrate_lock.lock().await;
        self.run(|conn| {
            schema::ensure_runtime_pragmas(conn)?;
            schema::run_migrations(conn)
        })
        .await
    }

    async fn run<F, T>(&self, f: F) -> Result<T, PersistError>
    where
        F: FnOnce(&mut Connection) -> Result<T, PersistError> + Send + 'static,
        T: Send + 'static,
    {
        let conn = self.pool.get().await.map_err(|e| PersistError::Pool(e.to_string()))?;
        let result = conn
            .interact(f)
            .await
            .map_err(|e| PersistError::Pool(format!("interact failed: {e}")))?;
        result
    }

    pub async fn ensure_catalog_account(
        &self,
        provider: String,
        base_url: String,
        username: String,
    ) -> Result<CatalogAccount, PersistError> {
        self.run(move |conn| repo::ensure_catalog_account(conn, &provider, &base_url, &username))
            .await
    }

    pub async fn upsert_publication(
        &self,
        input: PublicationInput,
    ) -> Result<PublicationUpsert, PersistError> {
        self.run(move |conn| repo::upsert_publication(conn, &input))
            .await
    }

    pub async fn find_publication(
        &self,
        account_id: i64,
        provider: String,
        canonical_id: String,
    ) -> Result<Option<StoredPublication>, PersistError> {
        self.run(
            move |conn| repo::find_publication(conn, account_id, &provider, &canonical_id),
        )
        .await
    }

    pub async fn get_publication(
        &self,
        publication_id: i64,
    ) -> Result<Option<StoredPublication>, PersistError> {
        self.run(move |conn| repo::get_publication(conn, publication_id))
            .await
    }

    pub async fn set_publication_available(
        &self,
        publication_id: i64,
        available: bool,
    ) -> Result<bool, PersistError> {
        self.run(move |conn| repo::set_publication_available(conn, publication_id, available))
            .await
    }

    pub async fn upsert_acquisition(
        &self,
        input: AcquisitionInput,
    ) -> Result<AcquisitionUpsert, PersistError> {
        self.run(move |conn| repo::upsert_acquisition(conn, &input))
            .await
    }

    pub async fn list_acquisitions(
        &self,
        publication_id: i64,
    ) -> Result<Vec<StoredAcquisition>, PersistError> {
        self.run(move |conn| repo::list_acquisitions(conn, publication_id))
            .await
    }

    pub async fn create_file_revision(
        &self,
        input: RevisionInput,
    ) -> Result<StoredFileRevision, PersistError> {
        self.run(move |conn| repo::create_file_revision(conn, &input))
            .await
    }

    pub async fn attach_revision_local_path(
        &self,
        revision_id: i64,
        relative_path: String,
    ) -> Result<bool, PersistError> {
        self.run(move |conn| {
            repo::attach_revision_local_path(conn, revision_id, &relative_path)
        })
        .await
    }

    pub async fn current_revision(
        &self,
        acquisition_id: i64,
    ) -> Result<Option<StoredFileRevision>, PersistError> {
        self.run(move |conn| repo::current_revision(conn, acquisition_id))
            .await
    }

    pub async fn create_download_job(
        &self,
        revision_id: i64,
    ) -> Result<StoredDownloadJob, PersistError> {
        self.run(move |conn| repo::create_download_job(conn, revision_id))
            .await
    }

    pub async fn set_job_state(
        &self,
        job_id: i64,
        to: JobState,
        error: Option<String>,
    ) -> Result<bool, PersistError> {
        self.run(move |conn| repo::set_job_state(conn, job_id, to, error.as_deref()))
            .await
    }

    pub async fn get_job(&self, job_id: i64) -> Result<Option<StoredDownloadJob>, PersistError> {
        self.run(move |conn| repo::get_job(conn, job_id)).await
    }

    pub async fn active_jobs(&self) -> Result<Vec<StoredDownloadJob>, PersistError> {
        self.run(|conn| repo::active_jobs(conn)).await
    }

    pub async fn jobs_for_revision(
        &self,
        revision_id: i64,
    ) -> Result<Vec<StoredDownloadJob>, PersistError> {
        self.run(move |conn| repo::jobs_for_revision(conn, revision_id))
            .await
    }

    pub async fn recover_interrupted_jobs(&self) -> Result<usize, PersistError> {
        self.run(|conn| repo::recover_interrupted_jobs(conn)).await
    }

    pub async fn purge_stale_jobs(&self, older_than_unix: i64) -> Result<usize, PersistError> {
        self.run(move |conn| repo::purge_stale_jobs(conn, older_than_unix))
            .await
    }
}
