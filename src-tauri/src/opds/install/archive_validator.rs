use std::io::Read;
use std::path::Path;

use crate::opds::acquisition::MEDIA_TYPE_EPUB;
use crate::opds::errors::DownloadError;

pub fn validate_epub_zip(path: &Path) -> Result<(), DownloadError> {
    let file = std::fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(std::io::BufReader::new(file))
        .map_err(|e| DownloadError::InvalidZip(e.to_string()))?;
    if archive.is_empty() {
        return Err(DownloadError::InvalidZip(
            "archive contains no entries".to_string(),
        ));
    }
    let mut mimetype = archive
        .by_name("mimetype")
        .map_err(|_| DownloadError::InvalidZip("missing mimetype entry".to_string()))?;
    let mut contents = String::new();
    mimetype
        .read_to_string(&mut contents)
        .map_err(|e| DownloadError::InvalidZip(format!("mimetype is not readable: {e}")))?;
    if contents.trim() != MEDIA_TYPE_EPUB {
        return Err(DownloadError::InvalidZip(format!(
            "mimetype is '{}'",
            contents.trim()
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use tempfile::tempdir;

    fn make_epub_bytes() -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        writer.start_file("mimetype", options).unwrap();
        writer.write_all(b"application/epub+zip").unwrap();
        writer.start_file("OEBPS/content.xhtml", options).unwrap();
        writer.write_all(b"<html><body>hi</body></html>").unwrap();
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn validate_epub_zip_accepts_valid_and_rejects_corrupt() {
        let dir = tempdir().unwrap();
        let good = dir.path().join("good.epub");
        std::fs::write(&good, make_epub_bytes()).unwrap();
        assert!(validate_epub_zip(&good).is_ok());

        let bad_zip = dir.path().join("bad.epub");
        std::fs::write(&bad_zip, b"not a zip").unwrap();
        assert!(matches!(
            validate_epub_zip(&bad_zip),
            Err(DownloadError::InvalidZip(_))
        ));
    }

    #[test]
    fn validate_epub_zip_rejects_wrong_mimetype() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("wrong.epub");
        let cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        writer.start_file("mimetype", options).unwrap();
        writer.write_all(b"application/pdf").unwrap();
        let bytes = writer.finish().unwrap().into_inner();
        std::fs::write(&path, bytes).unwrap();

        assert!(matches!(
            validate_epub_zip(&path),
            Err(DownloadError::InvalidZip(_))
        ));
    }
}
