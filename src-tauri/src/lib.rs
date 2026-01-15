// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_sql::Builder::default().build());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
