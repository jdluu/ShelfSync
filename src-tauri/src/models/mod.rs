use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Book {
    pub id: i64,
    pub title: String,
    pub authors: String, // Comma separated string for simplicity in frontend
    pub path: String,
    pub cover_url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ConnectionInfo {
    pub ip: String,
    pub port: u16,
    pub hostname: String,
}
