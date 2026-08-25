use crate::opds::DownloadError;
use url::Url;

pub(crate) fn sanitize_error_message(err: &DownloadError) -> String {
    match err {
        DownloadError::Transport(msg) => {
            if msg.contains("credentials")
                || msg.contains("auth")
                || msg.contains("password")
                || msg.contains("user")
            {
                "Authentication failed".to_string()
            } else if msg.contains("origin") || msg.contains("cross") || msg.contains("redirect") {
                "Cross-origin download rejected".to_string()
            } else if msg.contains("status") || msg.contains("HTTP") {
                "Download failed".to_string()
            } else {
                "Download failed".to_string()
            }
        }
        DownloadError::Network(_) => "Network error during download".to_string(),
        DownloadError::AuthFailed => "Authentication failed".to_string(),
        DownloadError::Forbidden => "Access to this file is forbidden".to_string(),
        DownloadError::NotFound => "Download resource not found".to_string(),
        DownloadError::RateLimited => "Rate limited by server".to_string(),
        DownloadError::Server(_) => "Server error during download".to_string(),
        DownloadError::ContentTypeMismatch(_, _) => "Content type mismatch".to_string(),
        DownloadError::SizeExceeded(_, _) => "Download too large".to_string(),
        DownloadError::LengthMismatch(expected, actual) => {
            format!("Download size mismatch: expected {expected} bytes, received {actual} bytes")
        }
        DownloadError::HashMismatch(algorithm, _) => {
            format!("Checksum verification failed ({algorithm})")
        }
        DownloadError::InvalidZip(msg) => format!("Invalid EPUB archive: {msg}"),
        DownloadError::InvalidDestination(_) => "Invalid download destination".to_string(),
        DownloadError::IoError => "IO error during download".to_string(),
        DownloadError::IncompleteDownload => "Download incomplete".to_string(),
        DownloadError::Cancelled => "Download cancelled".to_string(),
    }
}

#[allow(dead_code)]
pub(crate) fn validate_download_params(url: &Url) -> Result<(), String> {
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Invalid URL: only HTTP and HTTPS schemes are allowed".to_string());
    }

    if !url.username().is_empty() {
        return Err("Invalid URL: credentials must not be embedded in URL".to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_download_params_valid_http() {
        let url = Url::parse("http://example.com/opds").unwrap();
        let result = validate_download_params(&url);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_download_params_valid_https() {
        let url = Url::parse("https://example.com/opds").unwrap();
        let result = validate_download_params(&url);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_download_params_invalid_scheme() {
        let url = Url::parse("ftp://example.com/opds").unwrap();
        let result = validate_download_params(&url);
        assert!(result.is_err());
        if let Err(msg) = result {
            assert!(msg.contains("HTTP") || msg.contains("HTTPS"));
        }
    }

    #[test]
    fn test_validate_download_params_credentials_in_url() {
        let url = Url::parse("https://user:pass@example.com/opds").unwrap();
        let result = validate_download_params(&url);
        assert!(result.is_err());
        if let Err(msg) = result {
            assert!(msg.contains("credentials") || msg.contains("embedded"));
        }
    }

    #[test]
    fn test_sanitize_error_message_no_credential_exposure() {
        use crate::opds::DownloadError;

        let err =
            DownloadError::Transport("credentials in URL: user=secret, pass=hidden".to_string());
        let msg = sanitize_error_message(&err);
        assert!(!msg.contains("secret"));
        assert!(!msg.contains("hidden"));
        assert!(msg.contains("Authentication") || msg.contains("failed"));
    }

    #[test]
    fn test_sanitize_error_message_content_type() {
        use crate::opds::DownloadError;

        let err = DownloadError::ContentTypeMismatch(
            "application/epub+zip".to_string(),
            "text/html".to_string(),
        );
        let msg = sanitize_error_message(&err);
        assert!(msg.contains("Content type"));
    }

    #[test]
    fn test_sanitize_error_message_cross_origin() {
        use crate::opds::DownloadError;

        let err = DownloadError::Transport(
            "cross-origin download from https://evil.com rejected".to_string(),
        );
        let msg = sanitize_error_message(&err);
        assert!(!msg.contains("evil.com"));
    }
}
