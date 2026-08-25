use std::io;
use std::path::{Path, PathBuf};

use crate::opds::{safe_join, safe_remove_within_root};
use crate::persist::{validate_relative_path, LibraryStore, PersistError};

const PART_FILE_MARKER: &str = ".part";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct DiskSpaceStatus {
    pub available_bytes: u64,
    pub required_bytes: u64,
    pub sufficient: bool,
}

#[cfg(unix)]
pub fn available_disk_bytes(path: &Path) -> io::Result<u64> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let c_path = CString::new(path.as_os_str().as_bytes()).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "path contains interior null byte",
        )
    })?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    let rc = unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) };
    if rc != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(stat.f_bavail as u64 * stat.f_bsize as u64)
}

#[cfg(not(unix))]
pub fn available_disk_bytes(_path: &Path) -> io::Result<u64> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "disk space check is not supported on this platform",
    ))
}

pub fn check_disk_space(content_root: &Path, required_bytes: u64) -> io::Result<DiskSpaceStatus> {
    let available_bytes = available_disk_bytes(content_root)?;
    Ok(DiskSpaceStatus {
        available_bytes,
        required_bytes,
        sufficient: available_bytes >= required_bytes,
    })
}

fn is_part_file(file_name: &str) -> bool {
    // The verified pipeline writes fragments named `<name>.epub.part-<uuid>`
    // while the legacy downloader uses a plain `.part` suffix.
    file_name.ends_with(PART_FILE_MARKER) || file_name.contains(".part-")
}

/// Removes leftover `.part` download fragments beneath the content root.
///
/// Only files whose names contain the `.part` marker are considered and every
/// removal goes through the content-root containment helper. The walk is best
/// effort: individual removal failures are skipped so one unreadable entry
/// cannot block startup cleanup.
pub fn cleanup_stale_part_files(root: &Path) -> io::Result<Vec<PathBuf>> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut removed = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let file_type = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };
            if file_type.is_dir() {
                stack.push(path);
                continue;
            }
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !is_part_file(&name) {
                continue;
            }
            if let Ok(true) = safe_remove_within_root(root, &path) {
                removed.push(path);
            }
        }
    }
    removed.sort();
    Ok(removed)
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct StartupRecovery {
    pub recovered_jobs: usize,
    pub removed_part_files: Vec<PathBuf>,
}

/// Restores consistent state after an app restart.
///
/// Active download jobs left behind by a crash are marked interrupted via
/// `recover_interrupted_jobs`, then stale `.part` fragments are swept from the
/// content root while no downloads can be in flight.
pub async fn restore_library_on_startup(
    store: &LibraryStore,
    content_root: &Path,
) -> Result<StartupRecovery, PersistError> {
    let recovered_jobs = store.recover_interrupted_jobs().await?;
    let removed_part_files = cleanup_stale_part_files(content_root).map_err(PersistError::Io)?;
    Ok(StartupRecovery {
        recovered_jobs,
        removed_part_files,
    })
}

#[derive(Debug, thiserror::Error)]
pub enum DeleteLocalError {
    #[error("file revision {0} does not exist")]
    RevisionNotFound(i64),
    #[error("revision {0} has no local file recorded")]
    NoLocalFile(i64),
    #[error("persistence failed: {0}")]
    Persist(#[from] PersistError),
    #[error("{0}")]
    Path(#[from] crate::opds::DownloadError),
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct DeletedContent {
    pub revision_id: i64,
    pub deleted_file: bool,
}

/// Deletes the local file of one revision after re-validating that the stored
/// relative path stays inside the content root. The database pointer is cleared
/// even when the file is already gone so records do not reference missing data.
pub async fn delete_local_content(
    store: &LibraryStore,
    content_root: &Path,
    revision_id: i64,
) -> Result<DeletedContent, DeleteLocalError> {
    let revision = store
        .get_revision(revision_id)
        .await?
        .ok_or(DeleteLocalError::RevisionNotFound(revision_id))?;
    let relative = revision
        .local_relative_path
        .ok_or(DeleteLocalError::NoLocalFile(revision_id))?;

    validate_relative_path(&relative)?;
    let target = safe_join(content_root, Path::new(&relative))?;
    let deleted_file = safe_remove_within_root(content_root, &target)?;

    store.clear_revision_local_path(revision_id).await?;
    Ok(DeletedContent {
        revision_id,
        deleted_file,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_file(path: &Path, contents: &[u8]) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, contents).unwrap();
    }

    #[test]
    fn disk_space_check_reports_sufficiency() {
        let dir = tempdir().unwrap();
        let status = check_disk_space(dir.path(), 1).unwrap();
        assert!(status.sufficient);
        assert!(status.available_bytes > 0);
        assert_eq!(status.required_bytes, 1);

        let status = check_disk_space(dir.path(), u64::MAX / 2).unwrap();
        assert!(!status.sufficient);
        assert_eq!(status.required_bytes, u64::MAX / 2);
    }

    #[test]
    fn disk_space_check_requires_existing_path_on_unix() {
        let missing = std::env::temp_dir().join("shelfsync-missing-root-for-statvfs");
        let _ = std::fs::remove_dir_all(&missing);
        #[cfg(unix)]
        assert!(available_disk_bytes(&missing).is_err());
    }

    #[test]
    fn stale_part_cleanup_removes_only_part_fragments() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let part_a = root.join("Book.epub.part-1234");
        let part_b = root.join("nested/deeper/Other.epub.part-abcd");
        let keep = root.join("Book.epub");
        let keep_nested = root.join("nested/note.partkeep.txt");
        write_file(&part_a, b"partial");
        write_file(&part_b, b"partial");
        write_file(&keep, b"verified epub");
        write_file(&keep_nested, b"unrelated");

        let removed = cleanup_stale_part_files(root).unwrap();
        let mut expected = vec![part_a.clone(), part_b.clone()];
        expected.sort();
        assert_eq!(removed, expected);

        assert!(!part_a.exists());
        assert!(!part_b.exists());
        assert!(keep.exists(), "complete downloads must never be touched");
        assert!(keep_nested.exists(), "non part files must survive");

        // A second pass finds nothing left to remove.
        assert!(cleanup_stale_part_files(root).unwrap().is_empty());
    }

    #[test]
    fn stale_part_cleanup_handles_missing_root_and_refuses_outside_paths() {
        let dir = tempdir().unwrap();
        let missing = dir.path().join("nope");
        assert!(cleanup_stale_part_files(&missing).unwrap().is_empty());

        // A symlink inside the root pointing outside must not be followed for
        // deletion outside the content root.
        #[cfg(unix)]
        {
            let root = dir.path().join("root");
            std::fs::create_dir_all(&root).unwrap();
            let victim = dir.path().join("victim.txt");
            write_file(&victim, b"outside payload");
            #[allow(clippy::incompatible_msrv)]
            let link_result = std::os::unix::fs::symlink(&victim, root.join("evil.epub.part-1"));
            if link_result.is_ok() {
                let removed = cleanup_stale_part_files(&root).unwrap();
                assert!(
                    removed.is_empty(),
                    "symlinked targets outside the root must be refused"
                );
                assert!(victim.exists());
            }
        }
    }

    #[tokio::test]
    async fn startup_recovery_marks_jobs_interrupted_and_sweeps_parts() {
        let dir = tempdir().unwrap();
        let store = LibraryStore::open(dir.path().join("client.db"))
            .await
            .unwrap();
        let content_root = dir.path().join("content");
        std::fs::create_dir_all(&content_root).unwrap();

        let account = store
            .ensure_catalog_account(
                "grimmory".to_string(),
                "https://books.example.com".to_string(),
                "alice".to_string(),
            )
            .await
            .unwrap();
        let upsert = store
            .upsert_publication(crate::persist::PublicationInput {
                account_id: account.id,
                provider: "grimmory".to_string(),
                canonical_id: "book-1".to_string(),
                metadata_json: r#"{"title":"First"}"#.to_string(),
            })
            .await
            .unwrap();
        let acquisition = store
            .upsert_acquisition(crate::persist::AcquisitionInput {
                publication_id: upsert.publication.id,
                media_type: "application/epub+zip".to_string(),
                canonical_url: "https://books.example.com/download/book-1.epub".to_string(),
            })
            .await
            .unwrap();
        let revision = store
            .create_file_revision(crate::persist::RevisionInput {
                acquisition_id: acquisition.acquisition.id,
                expected_length: None,
                expected_hash: None,
                hash_algorithm: None,
                local_relative_path: None,
            })
            .await
            .unwrap();
        let job = store.create_download_job(revision.id).await.unwrap();
        assert!(store
            .set_job_state(job.id, crate::persist::JobState::Running, None)
            .await
            .unwrap());

        let stale_part = content_root.join("Book.epub.part-xyz");
        write_file(&stale_part, b"partial bytes");

        let recovery = restore_library_on_startup(&store, &content_root)
            .await
            .unwrap();
        assert_eq!(recovery.recovered_jobs, 1);
        assert_eq!(recovery.removed_part_files, vec![stale_part.clone()]);
        assert!(!stale_part.exists());

        let restored_job = store.get_job(job.id).await.unwrap().unwrap();
        assert_eq!(restored_job.state, crate::persist::JobState::Interrupted);

        // Idempotent: running recovery again reports nothing new.
        let again = restore_library_on_startup(&store, &content_root)
            .await
            .unwrap();
        assert_eq!(again.recovered_jobs, 0);
        assert!(again.removed_part_files.is_empty());
    }

    #[tokio::test]
    async fn delete_local_content_removes_file_and_clears_record() {
        let dir = tempdir().unwrap();
        let store = LibraryStore::open(dir.path().join("client.db"))
            .await
            .unwrap();
        let content_root = dir.path().join("content");
        std::fs::create_dir_all(&content_root).unwrap();

        let account = store
            .ensure_catalog_account(
                "grimmory".to_string(),
                "https://books.example.com".to_string(),
                "alice".to_string(),
            )
            .await
            .unwrap();
        let upsert = store
            .upsert_publication(crate::persist::PublicationInput {
                account_id: account.id,
                provider: "grimmory".to_string(),
                canonical_id: "book-1".to_string(),
                metadata_json: r#"{"title":"First"}"#.to_string(),
            })
            .await
            .unwrap();
        let acquisition = store
            .upsert_acquisition(crate::persist::AcquisitionInput {
                publication_id: upsert.publication.id,
                media_type: "application/epub+zip".to_string(),
                canonical_url: "https://books.example.com/download/book-1.epub".to_string(),
            })
            .await
            .unwrap();
        let revision = store
            .create_file_revision(crate::persist::RevisionInput {
                acquisition_id: acquisition.acquisition.id,
                expected_length: None,
                expected_hash: None,
                hash_algorithm: None,
                local_relative_path: None,
            })
            .await
            .unwrap();
        let job = store.create_download_job(revision.id).await.unwrap();
        assert!(store
            .set_job_state(job.id, crate::persist::JobState::Running, None)
            .await
            .unwrap());
        store
            .complete_download(revision.id, "books/book-1.epub".to_string(), job.id)
            .await
            .unwrap();

        let target = content_root.join("books").join("book-1.epub");
        write_file(&target, b"verified epub");

        let result = delete_local_content(&store, &content_root, revision.id)
            .await
            .unwrap();
        assert!(result.deleted_file);
        assert!(!target.exists());

        let cleared = store.get_revision(revision.id).await.unwrap().unwrap();
        assert!(cleared.local_relative_path.is_none());
    }

    #[tokio::test]
    async fn delete_local_content_rejects_paths_outside_content_root() {
        let dir = tempdir().unwrap();
        let store = LibraryStore::open(dir.path().join("client.db"))
            .await
            .unwrap();
        let content_root = dir.path().join("content");
        std::fs::create_dir_all(&content_root).unwrap();

        let account = store
            .ensure_catalog_account(
                "grimmory".to_string(),
                "https://books.example.com".to_string(),
                "alice".to_string(),
            )
            .await
            .unwrap();
        let upsert = store
            .upsert_publication(crate::persist::PublicationInput {
                account_id: account.id,
                provider: "grimmory".to_string(),
                canonical_id: "book-1".to_string(),
                metadata_json: r#"{"title":"First"}"#.to_string(),
            })
            .await
            .unwrap();
        let acquisition = store
            .upsert_acquisition(crate::persist::AcquisitionInput {
                publication_id: upsert.publication.id,
                media_type: "application/epub+zip".to_string(),
                canonical_url: "https://books.example.com/download/book-1.epub".to_string(),
            })
            .await
            .unwrap();
        let revision = store
            .create_file_revision(crate::persist::RevisionInput {
                acquisition_id: acquisition.acquisition.id,
                expected_length: None,
                expected_hash: None,
                hash_algorithm: None,
                local_relative_path: None,
            })
            .await
            .unwrap();
        let job = store.create_download_job(revision.id).await.unwrap();
        assert!(store
            .set_job_state(job.id, crate::persist::JobState::Running, None)
            .await
            .unwrap());
        store
            .complete_download(revision.id, "books/book-1.epub".to_string(), job.id)
            .await
            .unwrap();

        // Simulate a tampered database row pointing outside the content root.
        {
            let conn_for_tamper = rusqlite::Connection::open(dir.path().join("client.db")).unwrap();
            conn_for_tamper
                .execute(
                    "UPDATE file_revision SET local_relative_path = '../victim.epub' WHERE id = ?1",
                    [revision.id],
                )
                .unwrap();
        }
        let victim = dir.path().join("victim.epub");
        write_file(&victim, b"must survive");

        let err = delete_local_content(&store, &content_root, revision.id)
            .await
            .unwrap_err();
        assert!(
            matches!(err, DeleteLocalError::Persist(PersistError::UnsafePath(_))),
            "unexpected error: {err:?}"
        );
        assert!(
            victim.exists(),
            "files outside the root must not be deleted"
        );

        // An absolute path recorded in the row must also be refused.
        {
            let conn_for_tamper = rusqlite::Connection::open(dir.path().join("client.db")).unwrap();
            conn_for_tamper
                .execute(
                    "UPDATE file_revision SET local_relative_path = ?1 WHERE id = ?2",
                    rusqlite::params![victim.to_string_lossy().to_string(), revision.id],
                )
                .unwrap();
        }
        let err = delete_local_content(&store, &content_root, revision.id)
            .await
            .unwrap_err();
        assert!(matches!(
            err,
            DeleteLocalError::Persist(PersistError::UnsafePath(_))
        ));
        assert!(victim.exists());

        let cleared = store.get_revision(revision.id).await.unwrap().unwrap();
        assert!(
            cleared.local_relative_path.is_some(),
            "a refused delete must not rewrite the record"
        );
    }

    #[tokio::test]
    async fn delete_local_content_reports_missing_state_cleanly() {
        let dir = tempdir().unwrap();
        let store = LibraryStore::open(dir.path().join("client.db"))
            .await
            .unwrap();
        let content_root = dir.path().join("content");
        std::fs::create_dir_all(&content_root).unwrap();

        let err = delete_local_content(&store, &content_root, 999)
            .await
            .unwrap_err();
        assert!(matches!(err, DeleteLocalError::RevisionNotFound(999)));
    }

    #[test]
    fn safe_join_blocks_escaping_targets_before_delete() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("root");
        std::fs::create_dir_all(&root).unwrap();
        let escaped = safe_join(&root, Path::new("../escape.epub"));
        assert!(escaped.is_err());
    }
}
