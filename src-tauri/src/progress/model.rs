//! Wire shapes for the Grimmory KOReader progress endpoints.

use serde::{Deserialize, Serialize};

/// Progress object exchanged with `GET/PUT /syncs/progress`, matching the
/// documented Grimmory schema: int64 timestamp plus string document hash,
/// float percentage, and free form position/device fields.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KoReaderProgress {
    pub timestamp: i64,
    pub document: String,
    #[serde(default)]
    pub percentage: Option<f32>,
    #[serde(default)]
    pub progress: Option<String>,
    #[serde(default)]
    pub device: Option<String>,
    #[serde(default)]
    pub device_id: Option<String>,
}

/// Caller supplied local reading position for one verified file revision.
///
/// The adapter never derives these values itself from titles or paths; the
/// percentage must come from stored job or revision metadata (or a known
/// byte offset) computed by the caller.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct LocalProgressSnapshot {
    /// Reading position as a fraction in [0, 1].
    pub percentage: Option<f32>,
    /// Opaque position string forwarded as the protocol `progress` field.
    pub position: Option<String>,
    /// When the local position was recorded, in Unix seconds.
    pub updated_at_unix_seconds: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_documented_payload_with_optional_fields_absent() {
        let raw = r#"{"timestamp": 1700000000000, "document": "abc123", "percentage": 0.25}"#;
        let parsed: KoReaderProgress = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.timestamp, 1_700_000_000_000);
        assert_eq!(parsed.document, "abc123");
        assert_eq!(parsed.percentage, Some(0.25));
        assert_eq!(parsed.progress, None);
        assert_eq!(parsed.device, None);
        assert_eq!(parsed.device_id, None);
    }

    #[test]
    fn parses_full_payload() {
        let raw = serde_json::json!({
            "timestamp": 42,
            "document": "hash",
            "percentage": 0.9,
            "progress": "/body/2/Text:0",
            "device": "kobo",
            "device_id": "deadbeef"
        });
        let parsed: KoReaderProgress = serde_json::from_value(raw).unwrap();
        assert_eq!(parsed.progress.as_deref(), Some("/body/2/Text:0"));
        assert_eq!(parsed.device.as_deref(), Some("kobo"));
        assert_eq!(parsed.device_id.as_deref(), Some("deadbeef"));
    }

    #[test]
    fn missing_timestamp_is_rejected() {
        let raw = r#"{"document": "hash"}"#;
        assert!(serde_json::from_str::<KoReaderProgress>(raw).is_err());
    }
}
