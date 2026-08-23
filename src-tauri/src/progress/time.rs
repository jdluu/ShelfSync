//! Timestamp handling for progress comparisons.

/// Values at or above this threshold cannot be seconds since the Unix epoch
/// within any plausible horizon, so they are interpreted as milliseconds.
const MILLIS_THRESHOLD: i64 = 100_000_000_000;

/// Normalizes a remote or local timestamp to seconds before any comparison.
///
/// KOReader clients and servers have historically mixed seconds and
/// milliseconds; comparing raw values would misorder progress records, so
/// both sides are normalized first.
pub fn normalize_timestamp_seconds(raw: i64) -> i64 {
    if raw.abs() >= MILLIS_THRESHOLD {
        raw.div_euclid(1000)
    } else {
        raw
    }
}

pub(crate) fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_precision_values_pass_through() {
        assert_eq!(normalize_timestamp_seconds(0), 0);
        assert_eq!(normalize_timestamp_seconds(1_700_000_000), 1_700_000_000);
        // Just below the threshold: still treated as seconds.
        assert_eq!(
            normalize_timestamp_seconds(MILLIS_THRESHOLD - 1),
            MILLIS_THRESHOLD - 1
        );
    }

    #[test]
    fn millisecond_values_are_divided_down() {
        assert_eq!(
            normalize_timestamp_seconds(1_700_000_000_000),
            1_700_000_000
        );
        assert_eq!(normalize_timestamp_seconds(999_999_999_999), 999_999_999);
    }

    #[test]
    fn negative_timestamps_normalize_symmetrically() {
        assert_eq!(normalize_timestamp_seconds(-500), -500);
        assert_eq!(normalize_timestamp_seconds(-1_700_000_000_123), -1_700_000_001);
        assert_eq!(
            normalize_timestamp_seconds(-(MILLIS_THRESHOLD)),
            -(MILLIS_THRESHOLD / 1000)
        );
    }

    #[test]
    fn normalization_orders_mixed_units_correctly() {
        let older_ms = 1_699_999_999_999i64;
        let newer_s = 1_700_000_000i64;
        assert!(matches!(
            normalize_timestamp_seconds(newer_s).cmp(&normalize_timestamp_seconds(older_ms)),
            std::cmp::Ordering::Greater
        ));
    }
}
