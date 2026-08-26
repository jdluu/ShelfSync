use async_trait::async_trait;

use super::error::PersistError;
use super::model::{
    AcquisitionInput, AcquisitionUpsert, CatalogAccount, JobState, LibrarySnapshot,
    PublicationInput, PublicationUpsert, RevisionInput, StoredAcquisition, StoredDownloadJob,
    StoredFileRevision, StoredPublication,
};
use super::store::LibraryStore;

/// Persistence operations consumed by the offline/download pipeline.
///
/// The method set is derived from today's production call sites:
/// - download pipeline (`opds::install::download_verified_epub`)
/// - catalog reconciliation (`offline::refresh`)
/// - startup recovery and local deletion (`offline::maintenance`)
/// - library view command (`commands::offline::list_offline_library`)
///
/// Callers depend on this trait rather than on [`LibraryStore`] so alternate
/// implementations (in-memory test doubles, future backends) can be injected
/// without touching pipeline code. Lifecycle operations such as `open` and
/// `migrate` stay on the concrete store.
#[async_trait]
pub trait LibraryRepository: Send + Sync {
    async fn ensure_catalog_account(
        &self,
        provider: String,
        base_url: String,
        username: String,
    ) -> Result<CatalogAccount, PersistError>;

    async fn upsert_publication(
        &self,
        input: PublicationInput,
    ) -> Result<PublicationUpsert, PersistError>;

    async fn find_publication(
        &self,
        account_id: i64,
        provider: String,
        canonical_id: String,
    ) -> Result<Option<StoredPublication>, PersistError>;

    async fn set_publication_available(
        &self,
        publication_id: i64,
        available: bool,
    ) -> Result<bool, PersistError>;

    async fn list_publications_for_account(
        &self,
        account_id: i64,
    ) -> Result<Vec<StoredPublication>, PersistError>;

    async fn library_snapshot(&self) -> Result<LibrarySnapshot, PersistError>;

    async fn upsert_acquisition(
        &self,
        input: AcquisitionInput,
    ) -> Result<AcquisitionUpsert, PersistError>;

    async fn list_acquisitions(
        &self,
        publication_id: i64,
    ) -> Result<Vec<StoredAcquisition>, PersistError>;

    async fn create_file_revision(
        &self,
        input: RevisionInput,
    ) -> Result<StoredFileRevision, PersistError>;

    async fn clear_revision_local_path(&self, revision_id: i64) -> Result<bool, PersistError>;

    async fn get_revision(
        &self,
        revision_id: i64,
    ) -> Result<Option<StoredFileRevision>, PersistError>;

    async fn create_download_job(
        &self,
        revision_id: i64,
    ) -> Result<StoredDownloadJob, PersistError>;

    async fn set_job_state(
        &self,
        job_id: i64,
        to: JobState,
        error: Option<String>,
    ) -> Result<bool, PersistError>;

    async fn complete_download(
        &self,
        revision_id: i64,
        relative_path: String,
        job_id: i64,
    ) -> Result<StoredDownloadJob, PersistError>;

    async fn recover_interrupted_jobs(&self) -> Result<usize, PersistError>;
}

#[async_trait]
impl LibraryRepository for LibraryStore {
    async fn ensure_catalog_account(
        &self,
        provider: String,
        base_url: String,
        username: String,
    ) -> Result<CatalogAccount, PersistError> {
        LibraryStore::ensure_catalog_account(self, provider, base_url, username).await
    }

    async fn upsert_publication(
        &self,
        input: PublicationInput,
    ) -> Result<PublicationUpsert, PersistError> {
        LibraryStore::upsert_publication(self, input).await
    }

    async fn find_publication(
        &self,
        account_id: i64,
        provider: String,
        canonical_id: String,
    ) -> Result<Option<StoredPublication>, PersistError> {
        LibraryStore::find_publication(self, account_id, provider, canonical_id).await
    }

    async fn set_publication_available(
        &self,
        publication_id: i64,
        available: bool,
    ) -> Result<bool, PersistError> {
        LibraryStore::set_publication_available(self, publication_id, available).await
    }

    async fn list_publications_for_account(
        &self,
        account_id: i64,
    ) -> Result<Vec<StoredPublication>, PersistError> {
        LibraryStore::list_publications_for_account(self, account_id).await
    }

    async fn library_snapshot(&self) -> Result<LibrarySnapshot, PersistError> {
        LibraryStore::library_snapshot(self).await
    }

    async fn upsert_acquisition(
        &self,
        input: AcquisitionInput,
    ) -> Result<AcquisitionUpsert, PersistError> {
        LibraryStore::upsert_acquisition(self, input).await
    }

    async fn list_acquisitions(
        &self,
        publication_id: i64,
    ) -> Result<Vec<StoredAcquisition>, PersistError> {
        LibraryStore::list_acquisitions(self, publication_id).await
    }

    async fn create_file_revision(
        &self,
        input: RevisionInput,
    ) -> Result<StoredFileRevision, PersistError> {
        LibraryStore::create_file_revision(self, input).await
    }

    async fn clear_revision_local_path(&self, revision_id: i64) -> Result<bool, PersistError> {
        LibraryStore::clear_revision_local_path(self, revision_id).await
    }

    async fn get_revision(
        &self,
        revision_id: i64,
    ) -> Result<Option<StoredFileRevision>, PersistError> {
        LibraryStore::get_revision(self, revision_id).await
    }

    async fn create_download_job(
        &self,
        revision_id: i64,
    ) -> Result<StoredDownloadJob, PersistError> {
        LibraryStore::create_download_job(self, revision_id).await
    }

    async fn set_job_state(
        &self,
        job_id: i64,
        to: JobState,
        error: Option<String>,
    ) -> Result<bool, PersistError> {
        LibraryStore::set_job_state(self, job_id, to, error).await
    }

    async fn complete_download(
        &self,
        revision_id: i64,
        relative_path: String,
        job_id: i64,
    ) -> Result<StoredDownloadJob, PersistError> {
        LibraryStore::complete_download(self, revision_id, relative_path, job_id).await
    }

    async fn recover_interrupted_jobs(&self) -> Result<usize, PersistError> {
        LibraryStore::recover_interrupted_jobs(self).await
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tempfile::tempdir;

    use super::*;
    use crate::persist::JobState;

    /// Compile-time proof that the trait is object safe and implemented by
    /// the SQLite store; both coercions fail to compile otherwise.
    #[test]
    fn trait_object_smoke() {
        fn assert_object_safe<T: ?Sized>() {}
        assert_object_safe::<dyn LibraryRepository>();

        fn coerce(store: &LibraryStore) -> &dyn LibraryRepository {
            store
        }
        // Bind through a function pointer so the coercion is really checked.
        let witness: fn(&LibraryStore) -> &dyn LibraryRepository = coerce;
        let _ = witness;

        fn accepts_arc(_repo: Arc<dyn LibraryRepository>) {}
        let _ = accepts_arc as fn(Arc<dyn LibraryRepository>);
    }

    #[tokio::test]
    async fn full_download_pipeline_round_trip_through_dyn_repository() {
        let dir = tempdir().unwrap();
        let store = LibraryStore::open(dir.path().join("client.db"))
            .await
            .unwrap();
        let repo: Arc<dyn LibraryRepository> = Arc::new(store);

        let account = repo
            .ensure_catalog_account(
                "grimmory".to_string(),
                "https://books.example.com".to_string(),
                "alice".to_string(),
            )
            .await
            .unwrap();

        let upsert = repo
            .upsert_publication(PublicationInput {
                account_id: account.id,
                provider: "grimmory".to_string(),
                canonical_id: "book-1".to_string(),
                metadata_json: r#"{"title":"First"}"#.to_string(),
            })
            .await
            .unwrap();
        assert!(upsert.created);

        let acq_upsert = repo
            .upsert_acquisition(AcquisitionInput {
                publication_id: upsert.publication.id,
                media_type: "application/epub+zip".to_string(),
                canonical_url: "https://books.example.com/book-1.epub".to_string(),
            })
            .await
            .unwrap();

        let revision = repo
            .create_file_revision(RevisionInput {
                acquisition_id: acq_upsert.acquisition.id,
                expected_length: Some(1024),
                expected_hash: Some("abc123".to_string()),
                hash_algorithm: Some("sha256".to_string()),
                local_relative_path: None,
            })
            .await
            .unwrap();

        let job = repo.create_download_job(revision.id).await.unwrap();
        assert_eq!(job.state, JobState::Queued);
        assert!(repo
            .set_job_state(job.id, JobState::Running, None)
            .await
            .unwrap());

        let completed = repo
            .complete_download(revision.id, "books/book-1.epub".to_string(), job.id)
            .await
            .unwrap();
        assert_eq!(completed.state, JobState::Completed);

        let stored_revision = repo.get_revision(revision.id).await.unwrap().unwrap();
        assert_eq!(
            stored_revision.local_relative_path.as_deref(),
            Some("books/book-1.epub")
        );

        let snapshot = repo.library_snapshot().await.unwrap();
        assert_eq!(snapshot.complete.len(), 1);
        assert_eq!(snapshot.complete[0].revision_id, revision.id);

        assert_eq!(repo.recover_interrupted_jobs().await.unwrap(), 0);

        let publications = repo
            .list_publications_for_account(account.id)
            .await
            .unwrap();
        assert_eq!(publications.len(), 1);
        let acquisitions = repo.list_acquisitions(upsert.publication.id).await.unwrap();
        assert_eq!(acquisitions.len(), 1);
        let found = repo
            .find_publication(account.id, "grimmory".to_string(), "book-1".to_string())
            .await
            .unwrap()
            .expect("publication must round-trip");
        assert_eq!(found.id, upsert.publication.id);
        assert!(repo
            .set_publication_available(found.id, false)
            .await
            .unwrap());
    }
}
