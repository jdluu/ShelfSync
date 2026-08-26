use std::io::Read;
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::opds::errors::DownloadError;

pub trait ContentVerifier {
    fn verify(&self, path: &std::path::Path, expected: Option<&str>) -> Result<(), DownloadError>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct Sha256Verifier;

impl ContentVerifier for Sha256Verifier {
    fn verify(&self, path: &Path, expected: Option<&str>) -> Result<(), DownloadError> {
        let Some(expected) = expected else {
            return Ok(());
        };
        let computed = sha256_file(path)?;
        if !computed.eq_ignore_ascii_case(expected.trim()) {
            return Err(DownloadError::HashMismatch("sha256".to_string(), computed));
        }
        Ok(())
    }
}

pub fn sha256_file(path: &Path) -> Result<String, DownloadError> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    let digest = hasher.finalize();
    Ok(digest.iter().map(|b| format!("{:02x}", b)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::tempdir;

    fn sha256_hex(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        hasher
            .finalize()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }

    fn write_payload(dir: &std::path::Path, name: &str, payload: &[u8]) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, payload).unwrap();
        path
    }

    #[test]
    fn verify_accepts_matching_digest() {
        let dir = tempdir().unwrap();
        let payload = b"verified payload bytes";
        let path = write_payload(dir.path(), "part.bin", payload);

        Sha256Verifier
            .verify(&path, Some(&sha256_hex(payload)))
            .expect("matching digest must verify");
    }

    #[test]
    fn verify_without_expected_hash_is_noop() {
        let dir = tempdir().unwrap();
        let path = write_payload(dir.path(), "part.bin", b"anything");

        Sha256Verifier
            .verify(&path, None)
            .expect("no expected hash means no verification");
    }

    #[test]
    fn verify_compares_expected_case_insensitively() {
        let dir = tempdir().unwrap();
        let payload = b"case insensitive payload";
        let path = write_payload(dir.path(), "part.bin", payload);
        let upper = sha256_hex(payload).to_ascii_uppercase();

        Sha256Verifier
            .verify(&path, Some(&upper))
            .expect("uppercase expected digest must verify");
    }

    #[test]
    fn verify_mismatch_reports_computed_digest() {
        let dir = tempdir().unwrap();
        let payload = b"the real payload";
        let path = write_payload(dir.path(), "part.bin", payload);

        let err = Sha256Verifier
            .verify(&path, Some(sha256_hex(b"other bytes").as_str()))
            .expect_err("mismatching digest must fail");

        match err {
            DownloadError::HashMismatch(algorithm, computed) => {
                assert_eq!(algorithm, "sha256");
                assert_eq!(computed, sha256_hex(payload));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }
}
