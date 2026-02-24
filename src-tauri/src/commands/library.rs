use crate::{core::db, error::AppError, models::Book, AppState};
use tauri::State;

#[tauri::command]
pub fn get_books(
    library_path: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<Book>, AppError> {
    // 1. Fetch from DB
    let books = db::get_calibre_metadata(&library_path)?;

    // 2. Persist path
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("shelfsync_settings.json") {
        store.set("library_path", serde_json::json!(library_path));
        let _ = store.save();
    }

    // 3. Update Server State Cache
    let ptr = format!("{:p}", &*state.server as *const crate::http::server::ServerState);
    eprintln!("[COMMAND] [{}] Updating cache with {} books...", ptr, books.len());

    {
        let mut path_lock = state
            .server
            .library_path
            .lock()
            .map_err(|_| AppError::Unknown("Failed to lock library path".to_string()))?;
        *path_lock = Some(library_path.clone());

        let mut books_lock = state
            .server
            .books
            .lock()
            .map_err(|_| AppError::Unknown("Failed to lock books cache".to_string()))?;
        *books_lock = books.clone();
        eprintln!("[COMMAND] [{}] Cache updated successfully.", ptr);
    }

    Ok(books)
}

#[tauri::command]
pub fn set_library_path(
    path: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    // 1. Fetch and cache books
    let books = db::get_calibre_metadata(&path)?;

    // 2. Persist path
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("shelfsync_settings.json") {
        store.set("library_path", serde_json::json!(path));
        let _ = store.save();
    }

    // 3. Update State
    let mut lib_path = state
        .server
        .library_path
        .lock()
        .map_err(|_| AppError::Unknown("Failed to lock library path".to_string()))?;
    *lib_path = Some(path);

    let mut books_lock = state
        .server
        .books
        .lock()
        .map_err(|_| AppError::Unknown("Failed to lock books cache".to_string()))?;
    *books_lock = books;

    Ok(())
}

#[tauri::command]
pub async fn start_bulk_sync(
    books: Vec<Book>,
    host_ip: String,
    host_port: u16,
    token: String,
    destination_root: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    // Clone the sync manager reference before locking
    let sync_manager = {
        let sync_manager_lock = state.sync_manager.lock().expect("Poisoned lock");
        sync_manager_lock
            .as_ref()
            .ok_or_else(|| AppError::Unknown("Sync manager not initialized".to_string()))?
            .clone()
    }; // Lock is dropped here

    let tasks = books
        .into_iter()
        .map(|book| crate::core::sync::SyncTask {
            book,
            host_ip: host_ip.clone(),
            host_port,
            token: token.clone(),
            destination_root: std::path::PathBuf::from(&destination_root),
        })
        .collect();

    sync_manager
        .add_tasks(tasks)
        .await
        .map_err(AppError::Unknown)?;
    Ok(())
}
