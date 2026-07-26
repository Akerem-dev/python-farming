import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`${path}: expected marker was not found`);
  }
  if (source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error(`${path}: marker is not unique`);
  }
  writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  "src-tauri/src/commands/progress.rs",
  `use std::{\n    fs,\n    path::PathBuf,\n    time::{SystemTime, UNIX_EPOCH},\n};`,
  `use std::{\n    fs,\n    path::PathBuf,\n    sync::Mutex,\n    time::{SystemTime, UNIX_EPOCH},\n};`,
);

replaceOnce(
  "src-tauri/src/commands/progress.rs",
  `const DATABASE_FILENAME: &str = "python-farming.db";`,
  `const DATABASE_FILENAME: &str = "python-farming.db";\nstatic PROGRESS_OPERATION_LOCK: Mutex<()> = Mutex::new(());`,
);

replaceOnce(
  "src-tauri/src/commands/progress.rs",
  `tauri::async_runtime::spawn_blocking(move || load_progress_sync(&app))`,
  `tauri::async_runtime::spawn_blocking(move || {\n        with_progress_lock(|| load_progress_sync(&app))\n    })`,
);

replaceOnce(
  "src-tauri/src/commands/progress.rs",
  `tauri::async_runtime::spawn_blocking(move || complete_lesson_sync(&app, request))`,
  `tauri::async_runtime::spawn_blocking(move || {\n        with_progress_lock(|| complete_lesson_sync(&app, request))\n    })`,
);

replaceOnce(
  "src-tauri/src/commands/progress.rs",
  `tauri::async_runtime::spawn_blocking(move || set_last_lesson_sync(&app, &lesson_id))`,
  `tauri::async_runtime::spawn_blocking(move || {\n        with_progress_lock(|| set_last_lesson_sync(&app, &lesson_id))\n    })`,
);

replaceOnce(
  "src-tauri/src/commands/progress.rs",
  `pub(super) fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {`,
  `pub(super) fn with_progress_lock<T>(\n    operation: impl FnOnce() -> Result<T, String>,\n) -> Result<T, String> {\n    let _guard = PROGRESS_OPERATION_LOCK\n        .lock()\n        .map_err(|_| "İlerleme işlem kilidi kullanılamıyor.".to_string())?;\n    operation()\n}\n\npub(super) fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {`,
);

replaceOnce(
  "src-tauri/src/commands/progress_backup.rs",
  `    sync::{\n        atomic::{AtomicI64, Ordering},\n        Mutex,\n    },`,
  `    sync::atomic::{AtomicI64, Ordering},`,
);

replaceOnce(
  "src-tauri/src/commands/progress_backup.rs",
  `static LAST_BACKUP_TIMESTAMP: AtomicI64 = AtomicI64::new(0);\nstatic BACKUP_OPERATION_LOCK: Mutex<()> = Mutex::new(());`,
  `static LAST_BACKUP_TIMESTAMP: AtomicI64 = AtomicI64::new(0);`,
);

replaceOnce(
  "src-tauri/src/commands/progress_backup.rs",
  `pub(super) fn with_backup_lock<T>(\n    operation: impl FnOnce() -> Result<T, String>,\n) -> Result<T, String> {\n    let _guard = BACKUP_OPERATION_LOCK\n        .lock()\n        .map_err(|_| "Yedek işlem kilidi kullanılamıyor.".to_string())?;\n    operation()\n}`,
  `pub(super) fn with_backup_lock<T>(\n    operation: impl FnOnce() -> Result<T, String>,\n) -> Result<T, String> {\n    progress::with_progress_lock(operation)\n}`,
);

replaceOnce(
  "src-tauri/src/commands/progress_portability.rs",
  `    let directory = export_directory(app)?;\n    let file_name = format!(\n        "python-farming-progress-{exported_at}-{}.json",\n        std::process::id()\n    );\n    let file_path = directory.join(&file_name);\n    let temporary_path = file_path.with_extension("json.tmp");\n    cleanup_file(&temporary_path);\n    let mut file = OpenOptions::new()\n        .write(true)\n        .create_new(true)\n        .open(&temporary_path)\n        .map_err(|error| format!("Geçici dışa aktarma dosyası oluşturulamadı: {error}"))?;\n    if let Err(error) = file.write_all(&serialized).and_then(|_| file.sync_all()) {\n        drop(file);\n        cleanup_file(&temporary_path);\n        return Err(format!("İlerleme dışa aktarma dosyası yazılamadı: {error}"));\n    }\n    drop(file);\n    fs::rename(&temporary_path, &file_path).map_err(|error| {\n        cleanup_file(&temporary_path);\n        format!("İlerleme dışa aktarma dosyası yayımlanamadı: {error}")\n    })?;`,
  `    let file_name = format!(\n        "python-farming-progress-{exported_at}-{}.json",\n        std::process::id()\n    );\n    let file_path = write_export_file(app, &file_name, &serialized)?;`,
);

replaceOnce(
  "src-tauri/src/commands/progress_portability.rs",
  `fn export_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {\n    if let Ok(directory) = app.path().download_dir() {\n        fs::create_dir_all(&directory)\n            .map_err(|error| format!("İndirilenler klasörü hazırlanamadı: {error}"))?;\n        return Ok(directory);\n    }\n    if let Ok(directory) = app.path().document_dir() {\n        fs::create_dir_all(&directory)\n            .map_err(|error| format!("Belgeler klasörü hazırlanamadı: {error}"))?;\n        return Ok(directory);\n    }\n    let database_path = progress::database_path(app)?;\n    let data_directory = database_path\n        .parent()\n        .ok_or_else(|| "Uygulama veri klasörü belirlenemedi.".to_string())?;\n    let directory = data_directory.join("exports");\n    fs::create_dir_all(&directory)\n        .map_err(|error| format!("Dışa aktarma klasörü hazırlanamadı: {error}"))?;\n    Ok(directory)\n}`,
  `fn export_directories(app: &tauri::AppHandle) -> Result<Vec<PathBuf>, String> {\n    let mut directories = Vec::new();\n    if let Ok(directory) = app.path().download_dir() {\n        directories.push(directory);\n    }\n    if let Ok(directory) = app.path().document_dir() {\n        if !directories.contains(&directory) {\n            directories.push(directory);\n        }\n    }\n    let database_path = progress::database_path(app)?;\n    let data_directory = database_path\n        .parent()\n        .ok_or_else(|| "Uygulama veri klasörü belirlenemedi.".to_string())?;\n    let fallback = data_directory.join("exports");\n    if !directories.contains(&fallback) {\n        directories.push(fallback);\n    }\n    Ok(directories)\n}\n\nfn write_export_file(\n    app: &tauri::AppHandle,\n    file_name: &str,\n    serialized: &[u8],\n) -> Result<PathBuf, String> {\n    let mut failures = Vec::new();\n    for directory in export_directories(app)? {\n        if let Err(error) = fs::create_dir_all(&directory) {\n            failures.push(format!("{}: {error}", directory.display()));\n            continue;\n        }\n        let file_path = directory.join(file_name);\n        let temporary_path = file_path.with_extension("json.tmp");\n        cleanup_file(&temporary_path);\n        let mut file = match OpenOptions::new()\n            .write(true)\n            .create_new(true)\n            .open(&temporary_path)\n        {\n            Ok(file) => file,\n            Err(error) => {\n                failures.push(format!("{}: {error}", directory.display()));\n                continue;\n            }\n        };\n        if let Err(error) = file.write_all(serialized).and_then(|_| file.sync_all()) {\n            drop(file);\n            cleanup_file(&temporary_path);\n            failures.push(format!("{}: {error}", directory.display()));\n            continue;\n        }\n        drop(file);\n        match fs::rename(&temporary_path, &file_path) {\n            Ok(()) => return Ok(file_path),\n            Err(error) => {\n                cleanup_file(&temporary_path);\n                failures.push(format!("{}: {error}", directory.display()));\n            }\n        }\n    }\n    Err(format!(\n        "İlerleme dosyası Downloads, Documents veya uygulama veri klasörüne yazılamadı: {}",\n        failures.join(" | ")\n    ))\n}`,
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  `import { useProgressStore } from "../../features/progress/store/progressStore";`,
  `import { useProgressOperationStore } from "../../features/progress/store/progressOperationStore";\nimport { useProgressStore } from "../../features/progress/store/progressStore";`,
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  `  const progressStatus = useProgressStore((state) => state.status);\n  const loadProgress = useProgressStore((state) => state.loadProgress);`,
  `  const progressStatus = useProgressStore((state) => state.status);\n  const loadProgress = useProgressStore((state) => state.loadProgress);\n  const activeOperation = useProgressOperationStore((state) => state.activeOperation);\n  const tryBeginOperation = useProgressOperationStore((state) => state.tryBeginOperation);\n  const finishOperation = useProgressOperationStore((state) => state.finishOperation);`,
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  `  const createBackup = async () => {\n    setStatus("creating");\n    setError(null);\n    setAnnouncement("");\n    setPendingAction(null);\n    try {\n      const nextOverview = await createProgressBackup();\n      setOverview(nextOverview);\n      setStatus("ready");\n      setAnnouncement("İlerleme yedeği oluşturuldu ve bütünlük kontrolünden geçti.");\n    } catch (reason) {\n      setError(errorMessage(reason));\n      setStatus("error");\n    }\n  };`,
  `  const createBackup = async () => {\n    if (!tryBeginOperation("backup-create")) {\n      return;\n    }\n    setStatus("creating");\n    setError(null);\n    setAnnouncement("");\n    setPendingAction(null);\n    try {\n      const nextOverview = await createProgressBackup();\n      setOverview(nextOverview);\n      setStatus("ready");\n      setAnnouncement("İlerleme yedeği oluşturuldu ve bütünlük kontrolünden geçti.");\n    } catch (reason) {\n      setError(errorMessage(reason));\n      setStatus("error");\n    } finally {\n      finishOperation("backup-create");\n    }\n  };`,
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  `  const restoreBackup = async (backupId: string) => {\n    setStatus("restoring");`,
  `  const restoreBackup = async (backupId: string) => {\n    if (!tryBeginOperation("backup-restore")) {\n      return;\n    }\n    setStatus("restoring");`,
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  `    } finally {\n      setActiveBackupId(null);\n    }\n  };\n\n  const deleteBackup = async (backupId: string) => {`,
  `    } finally {\n      setActiveBackupId(null);\n      finishOperation("backup-restore");\n    }\n  };\n\n  const deleteBackup = async (backupId: string) => {`,
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  `  const deleteBackup = async (backupId: string) => {\n    setStatus("deleting");`,
  `  const deleteBackup = async (backupId: string) => {\n    if (!tryBeginOperation("backup-delete")) {\n      return;\n    }\n    setStatus("deleting");`,
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  `    } finally {\n      setActiveBackupId(null);\n    }\n  };\n\n  const available = overview?.available ?? false;`,
  `    } finally {\n      setActiveBackupId(null);\n      finishOperation("backup-delete");\n    }\n  };\n\n  const available = overview?.available ?? false;`,
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  `  const busy =\n    status === "loading" ||\n    status === "creating" ||\n    status === "restoring" ||\n    status === "deleting";`,
  `  const busy = status === "loading" || activeOperation !== null;`,
);
