use tauri::State;
use crate::{core::db, models::Book, AppState, error::AppError};

#[tauri::command]
pub fn get_books(library_path: String, state: State<'_, AppState>) -> Result<Vec<Book>, AppError> {
    // 1. Fetch from DB
    let books = db::get_calibre_metadata(&library_path)?;

    // 2. Update Server State Cache
    {
        let mut path_lock = state.server.library_path.lock().map_err(|_| AppError::Unknown("Failed to lock library path".to_string()))?;
        *path_lock = Some(library_path.clone());

        let mut books_lock = state.server.books.lock().map_err(|_| AppError::Unknown("Failed to lock books cache".to_string()))?;
        *books_lock = books.clone();
    }

    Ok(books)
}

#[tauri::command]
pub fn set_library_path(path: String, state: State<'_, AppState>) -> Result<(), AppError> {
    // Also fetch and cache books when explicitly setting path
    let books = db::get_calibre_metadata(&path)?;

    let mut lib_path = state.server.library_path.lock().map_err(|_| AppError::Unknown("Failed to lock library path".to_string()))?;
    *lib_path = Some(path);

    let mut books_lock = state.server.books.lock().map_err(|_| AppError::Unknown("Failed to lock books cache".to_string()))?;
    *books_lock = books;

    Ok(())
}
