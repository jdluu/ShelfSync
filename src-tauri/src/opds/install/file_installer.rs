use std::path::Path;

use crate::opds::errors::DownloadError;

pub fn promote_verified_part(part_path: &Path, dest_path: &Path) -> Result<(), DownloadError> {
    std::fs::rename(part_path, dest_path)
        .map_err(|e| DownloadError::InvalidDestination(format!("atomic rename failed: {}", e)))
}

pub fn safe_remove_within_root(root: &Path, target: &Path) -> Result<bool, DownloadError> {
    let canonical_root = std::fs::canonicalize(root).map_err(|_| {
        DownloadError::InvalidDestination(format!(
            "content root does not exist: {}",
            root.display()
        ))
    })?;
    if !target.exists() {
        return Ok(false);
    }
    let canonical_target = std::fs::canonicalize(target)
        .map_err(|_| DownloadError::InvalidDestination("target not resolvable".to_string()))?;
    if canonical_target == canonical_root || !canonical_target.starts_with(&canonical_root) {
        return Err(DownloadError::InvalidDestination(
            "refusing to delete outside content root".to_string(),
        ));
    }
    std::fs::remove_file(&canonical_target)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn safe_remove_refuses_paths_outside_content_root() {
        let dir = tempdir().unwrap();
        let root = dir.path().join("root");
        std::fs::create_dir_all(&root).unwrap();

        let inside = root.join("book.part");
        std::fs::write(&inside, b"x").unwrap();
        assert!(safe_remove_within_root(&root, &inside).unwrap());
        assert!(!inside.exists());

        let outside = dir.path().join("outside.epub");
        std::fs::write(&outside, b"keep me").unwrap();
        let err = safe_remove_within_root(&root, &outside).unwrap_err();
        assert!(matches!(err, DownloadError::InvalidDestination(_)));
        assert!(outside.exists(), "file outside root must not be deleted");

        let err = safe_remove_within_root(&root, &root).unwrap_err();
        assert!(matches!(err, DownloadError::InvalidDestination(_)));

        assert!(!safe_remove_within_root(&root, &root.join("missing.epub")).unwrap());
    }
}
