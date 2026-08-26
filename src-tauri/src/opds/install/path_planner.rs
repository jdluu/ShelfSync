use std::path::{Component, Path, PathBuf};

use crate::opds::errors::DownloadError;

pub fn safe_join(root: &Path, relative: &Path) -> Result<PathBuf, DownloadError> {
    let canonical_root = std::fs::canonicalize(root).map_err(|_| {
        DownloadError::InvalidDestination(format!(
            "content root does not exist: {}",
            root.display()
        ))
    })?;
    let mut joined = canonical_root;
    for component in relative.components() {
        match component {
            Component::Normal(_) => joined.push(component),
            Component::CurDir => {}
            _ => {
                return Err(DownloadError::InvalidDestination(
                    "destination path escapes content root".to_string(),
                ))
            }
        }
    }
    Ok(joined)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn safe_join_blocks_traversal_components() {
        let dir = tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("root")).unwrap();
        let root = dir.path().join("root");

        let ok = safe_join(&root, Path::new("Book.epub")).unwrap();
        assert!(ok.starts_with(std::fs::canonicalize(&root).unwrap()));
        assert!(ok.ends_with("Book.epub"));

        assert!(safe_join(&root, Path::new("../escape.epub")).is_err());
        assert!(safe_join(&root, Path::new("/absolute.epub")).is_err());

        let missing_root = dir.path().join("does-not-exist");
        assert!(safe_join(&missing_root, Path::new("x.epub")).is_err());
    }
}
