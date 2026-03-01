use crate::{
    core::db,
    error::{lock_or_err, AppError},
    models::Book,
    AppState,
};
use tauri::State;

#[tauri::command]
pub async fn get_books(
    library_path: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<Book>, AppError> {
    let db_path = std::path::Path::new(&library_path).join("metadata.db");
    if !db_path.exists() {
        return Err(AppError::LibraryNotFound(library_path.clone()));
    }
    
    let cfg = deadpool_sqlite::Config::new(&db_path);
    let pool = cfg.builder(deadpool_sqlite::Runtime::Tokio1).map_err(|e| AppError::Unknown(e.to_string()))?.build().map_err(|e| AppError::Unknown(e.to_string()))?;

    // 1. Fetch from DB
    let books = db::get_calibre_metadata(&pool).await?;

    // 2. Persist path
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("shelfsync_settings.json") {
        store.set("library_path", serde_json::json!(library_path));
        let _ = store.save();
    }

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
    }
    
    let mut pool_lock = state.server.db_pool.write().await;
    *pool_lock = Some(pool);

    Ok(books)
}

#[tauri::command]
pub async fn set_library_path(
    path: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    let db_path = std::path::Path::new(&path).join("metadata.db");
    if !db_path.exists() {
        return Err(AppError::LibraryNotFound(path.clone()));
    }
    
    let cfg = deadpool_sqlite::Config::new(&db_path);
    let pool = cfg.builder(deadpool_sqlite::Runtime::Tokio1).map_err(|e| AppError::Unknown(e.to_string()))?.build().map_err(|e| AppError::Unknown(e.to_string()))?;

    // 1. Fetch and cache books
    let books = db::get_calibre_metadata(&pool).await?;

    // 2. Persist path
    use tauri_plugin_store::StoreExt;
    if let Ok(store) = app.store("shelfsync_settings.json") {
        store.set("library_path", serde_json::json!(path.clone()));
        let _ = store.save();
    }

    // 3. Update State
    {
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
    }
    
    let mut pool_lock = state.server.db_pool.write().await;
    *pool_lock = Some(pool);

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
        let sync_manager_lock = lock_or_err(&state.sync_manager)?;
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
