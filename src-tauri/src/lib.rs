mod commands;

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    context.set_default_window_icon(Some(tauri::include_image!(
        "icons/app-icon-master.png"
    )));

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_version,
            commands::runtime::runtime_health_check,
            commands::runtime::execute_python,
            commands::project_runtime::execute_python_project,
            commands::progress::load_progress,
            commands::progress::complete_lesson_progress,
            commands::progress::set_last_lesson,
            commands::progress_backup::list_progress_backups,
            commands::progress_backup::create_progress_backup,
            commands::progress_backup::restore_progress_backup,
            commands::progress_backup::delete_progress_backup,
            commands::progress_portability::export_progress_data,
            commands::progress_portability::import_progress_data,
            commands::progress_portability::reset_progress_data,
        ])
        .run(context)
        .expect("Python Farming başlatılırken kritik bir hata oluştu");
}
