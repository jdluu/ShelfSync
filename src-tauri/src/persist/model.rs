use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CatalogAccount {
    pub id: i64,
    pub provider: String,
    pub base_url: String,
    pub username: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StoredPublication {
    pub id: i64,
    pub account_id: i64,
    pub provider: String,
    pub canonical_id: String,
    pub metadata_json: String,
    pub available: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StoredAcquisition {
    pub id: i64,
    pub publication_id: i64,
    pub media_type: String,
    pub canonical_url: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StoredFileRevision {
    pub id: i64,
    pub acquisition_id: i64,
    pub expected_length: Option<i64>,
    pub expected_hash: Option<String>,
    pub hash_algorithm: Option<String>,
    pub local_relative_path: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum JobState {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
    Interrupted,
}

impl JobState {
    pub const fn as_str(self) -> &'static str {
        match self {
            JobState::Queued => "queued",
            JobState::Running => "running",
            JobState::Completed => "completed",
            JobState::Failed => "failed",
            JobState::Cancelled => "cancelled",
            JobState::Interrupted => "interrupted",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "queued" => Some(JobState::Queued),
            "running" => Some(JobState::Running),
            "completed" => Some(JobState::Completed),
            "failed" => Some(JobState::Failed),
            "cancelled" => Some(JobState::Cancelled),
            "interrupted" => Some(JobState::Interrupted),
            _ => None,
        }
    }

    pub const fn is_terminal(self) -> bool {
        matches!(
            self,
            JobState::Completed | JobState::Failed | JobState::Cancelled | JobState::Interrupted
        )
    }
}

impl std::fmt::Display for JobState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StoredDownloadJob {
    pub id: i64,
    pub revision_id: i64,
    pub state: JobState,
    pub error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct PublicationInput {
    pub account_id: i64,
    pub provider: String,
    pub canonical_id: String,
    pub metadata_json: String,
}

#[derive(Debug, Clone)]
pub struct AcquisitionInput {
    pub publication_id: i64,
    pub media_type: String,
    pub canonical_url: String,
}

#[derive(Debug, Clone, Default)]
pub struct RevisionInput {
    pub acquisition_id: i64,
    pub expected_length: Option<i64>,
    pub expected_hash: Option<String>,
    pub hash_algorithm: Option<String>,
    pub local_relative_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PublicationUpsert {
    pub publication: StoredPublication,
    pub created: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AcquisitionUpsert {
    pub acquisition: StoredAcquisition,
    pub created: bool,
}
