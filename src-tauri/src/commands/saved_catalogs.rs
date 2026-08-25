use serde::{Deserialize, Serialize};
use tauri::command;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedCatalog {
    pub id: String,
    pub name: String,
    pub url: String,
    pub username: String,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CatalogStoreData {
    catalogs: Vec<SavedCatalog>,
}

/// List all saved OPDS catalog metadata (credentials excluded).
#[command]
pub fn opds_list_saved_catalogs(app: tauri::AppHandle) -> Result<Vec<SavedCatalog>, String> {
    match app.store("shelfsync_settings.json") {
        Ok(store) => {
            let data = store
                .get("saved_catalogs")
                .and_then(|v| serde_json::from_value::<CatalogStoreData>(v.clone()).ok())
                .unwrap_or(CatalogStoreData { catalogs: vec![] });
            Ok(data.catalogs)
        }
        Err(e) => Err(format!("Failed to open store: {}", e)),
    }
}

/// Save a catalog to the persistent store. Returns the full record.
#[command]
pub fn opds_save_catalog(
    app: tauri::AppHandle,
    name: String,
    url: String,
    username: String,
) -> Result<SavedCatalog, String> {
    let catalog = SavedCatalog {
        id: Uuid::new_v4().to_string(),
        name: name.trim().to_string(),
        url: url.trim().to_string(),
        username: username.trim().to_string(),
        added_at: chrono_or_default(),
    };
    persist_catalog(&app, catalog.clone())?;
    Ok(catalog)
}

/// Delete a catalog by id.
#[command]
pub fn opds_delete_catalog(app: tauri::AppHandle, id: String) -> Result<bool, String> {
    let store = app
        .store("shelfsync_settings.json")
        .map_err(|e| format!("Failed to open store: {}", e))?;
    let mut data: CatalogStoreData = store
        .get("saved_catalogs")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or(CatalogStoreData { catalogs: vec![] });
    let len_before = data.catalogs.len();
    data.catalogs.retain(|c| c.id != id);
    let removed = data.catalogs.len() < len_before;
    if removed {
        let json = serde_json::to_value(&data).map_err(|e| format!("Serialize error: {}", e))?;
        store.set("saved_catalogs", json);
        store.save().map_err(|e| format!("Save error: {}", e))?;
    }
    Ok(removed)
}

fn persist_catalog(app: &tauri::AppHandle, catalog: SavedCatalog) -> Result<(), String> {
    let store = app
        .store("shelfsync_settings.json")
        .map_err(|e| format!("Failed to open store: {}", e))?;
    let mut data: CatalogStoreData = store
        .get("saved_catalogs")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or(CatalogStoreData { catalogs: vec![] });
    data.catalogs.push(catalog);
    let json = serde_json::to_value(&data).map_err(|e| format!("Serialize error: {}", e))?;
    store.set("saved_catalogs", json);
    store.save().map_err(|e| format!("Save error: {}", e))?;
    Ok(())
}

fn chrono_or_default() -> String {
    // Use chrono if available, else fallback. Both not in deps; use simple ISO.
    // Rather than add a dep, build a UTC ISO timestamp with std.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    // Format as ISO 8601 date only: YYYY-MM-DD
    // A full RFC 3339 is nicer. Compute from unix epoch.
    let days = secs / 86400;
    // Approximate Gregorian date
    let mut y = 1970i64;
    let mut d = days as i64;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if d < days_in_year {
            break;
        }
        d -= days_in_year;
        y += 1;
    }
    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0usize;
    for (i, &md) in month_days.iter().enumerate() {
        if d < md as i64 {
            m = i;
            break;
        }
        d -= md as i64;
    }
    d += 1;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m + 1,
        d + 1,
        (secs % 86400) / 3600,
        (secs % 3600) / 60,
        secs % 60
    )
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}
