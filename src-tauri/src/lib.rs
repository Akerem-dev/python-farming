mod commands;

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_version,
            commands::runtime::runtime_health_check,
            commands::runtime::execute_python,
        ])
        .run(tauri::generate_context!())
        .expect("Python Farming başlatılırken kritik bir hata oluştu");
}
