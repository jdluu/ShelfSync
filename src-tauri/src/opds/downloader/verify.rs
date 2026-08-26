use std::path::Path;

use crate::opds::errors::DownloadError;
use crate::opds::verify::ContentVerifier;

pub(crate) fn ensure_verified<V: ContentVerifier>(
    part_path: &Path,
    expected: Option<&str>,
    verifier: &V,
) -> Result<(), DownloadError> {
    verifier.verify(part_path, expected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::opds::verify::Sha256Verifier;

    #[test]
    fn ensure_verified_delegates_to_verifier() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("part.bin");
        std::fs::write(&path, b"streamed bytes").unwrap();

        assert!(ensure_verified(&path, None, &Sha256Verifier).is_ok());
        assert!(ensure_verified(&path, Some("deadbeef"), &Sha256Verifier).is_err());
    }
}
