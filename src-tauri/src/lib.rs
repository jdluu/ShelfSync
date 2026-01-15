mod db;

#[tauri::command]
fn get_books(library_path: String) -> Result<Vec<db::Book>, String> {
    db::get_calibre_metadata(&library_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_books]);

    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_sql::Builder::default().build());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_books_command() {
        // This is a thin wrapper, but we can test it with a non-existent path
        let result = get_books("/non/existent/path".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("metadata.db not found"));
    }
}
