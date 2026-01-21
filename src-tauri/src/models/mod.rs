use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Book {
    pub id: i64,
    pub title: String,
    pub authors: String, // Comma separated string for simplicity in frontend
    pub path: String,
    pub cover_url: Option<String>,
    pub formats: Vec<String>,
    pub series: Option<String>,
    pub series_index: f64,
    pub tags: Vec<String>,
    pub publisher: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ConnectionInfo {
    pub ip: String,
    pub port: u16,
    pub hostname: String,
    pub pin: Option<String>,
}
