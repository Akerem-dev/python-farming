use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicI64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use super::progress;

const BACKUP_DIRECTORY: &str = "backups";
const BACKUP_PREFIX: &str = "progress-";
const BACKUP_EXTENSION: &str = "db";
const MAX_BACKUP_COUNT: usize = 5;
const MAX_BACKUP_TOTAL_BYTES: u64 = 25 * 1024 * 1024;
static LAST_BACKUP_TIMESTAMP: AtomicI64 = AtomicI64::new(0);
static BACKUP_OPERATION_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug)]
struct BackupCandidate {
    path: PathBuf,
    created_at: i64,
    size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressBackupMutationRequest {
    backup_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressBackupSummary {
    id: String,
    created_at: i64,
    size_bytes: u64,
    integrity_status: String,
    completed_lesson_count: Option<i64>,
    total_xp: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressBackupOverview {
    backups: Vec<ProgressBackupSummary>,
    max_backup_count: usize,
    max_total_bytes: u64,
    total_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressRestoreResult {
    progress: progress::ProgressSnapshot,
    backups: ProgressBackupOverview,
    restored_backup_id: String,
    safety_backup_id: String,
}

#[tauri::command]
pub async fn list_progress_backups(
    app: tauri::AppHandle,
) -> Result<ProgressBackupOverview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_backup_operation_lock(|| list_progress_backups_sync(&app))
    })
    .await
    .map_err(|error| format!("İlerleme yedekleri listelenemedi: {error}"))?
}

#[tauri::command]
pub async fn create_progress_backup(
    app: tauri::AppHandle,
) -> Result<ProgressBackupOverview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_backup_operation_lock(|| create_progress_backup_sync(&app))
    })
    .await
    .map_err(|error| format!("İlerleme yedeği oluşturulamadı: {error}"))?
}

#[tauri::command]
pub async fn restore_progress_backup(
    app: tauri::AppHandle,
    request: ProgressBackupMutationRequest,
) -> Result<ProgressRestoreResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_backup_operation_lock(|| restore_progress_backup_sync(&app, &request.backup_id))
    })
    .await
    .map_err(|error| format!("İlerleme yedeği geri yüklenemedi: {error}"))?
}

#[tauri::command]
pub async fn delete_progress_backup(
    app: tauri::AppHandle,
    request: ProgressBackupMutationRequest,
) -> Result<ProgressBackupOverview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_backup_operation_lock(|| delete_progress_backup_sync(&app, &request.backup_id))
    })
    .await
    .map_err(|error| format!("İlerleme yedeği silinemedi: {error}"))?
}

fn with_backup_operation_lock<T>(
    operation: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let _guard = BACKUP_OPERATION_LOCK
        .lock()
        .map_err(|_| "Yedek işlemi kilidi kullanılamıyor.".to_string())?;
    operation()
}

fn backup_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let database_path = progress::database_path(app)?;
    let data_directory = database_path
        .parent()
        .ok_or_else(|| "Uygulama veri klasörü belirlenemedi.".to_string())?;
    let backup_directory = data_directory.join(BACKUP_DIRECTORY);
    fs::create_dir_all(&backup_directory)
        .map_err(|error| format!("Yedek klasörü oluşturulamadı: {error}"))?;
    Ok(backup_directory)
}

fn create_progress_backup_sync(app: &tauri::AppHandle) -> Result<ProgressBackupOverview, String> {
    let source = progress::open_database(app)?;
    ensure_integrity(&source, "Ana ilerleme veritabanı")?;
    source
        .execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|error| format!("SQLite WAL verisi yedek öncesinde birleştirilemedi: {error}"))?;

    let backup_directory = backup_directory(app)?;
    let created_at = next_backup_timestamp(&backup_directory)?;
    let filename = format!(
        "{BACKUP_PREFIX}{created_at}-{}.{}",
        std::process::id(),
        BACKUP_EXTENSION
    );
    let backup_path = backup_directory.join(&filename);
    let temporary_path = backup_path.with_extension("db.tmp");
    let _ = fs::remove_file(&temporary_path);
    let escaped_path = temporary_path.to_string_lossy().replace('\'', "''");

    let vacuum_result = source.execute_batch(&format!("VACUUM INTO '{escaped_path}';"));
    drop(source);
    if let Err(error) = vacuum_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!("Tutarlı SQLite yedeği oluşturulamadı: {error}"));
    }

    validate_backup_database(&temporary_path, "Oluşturulan ilerleme yedeği").map_err(|error| {
        let _ = fs::remove_file(&temporary_path);
        error
    })?;

    let backup_size = fs::metadata(&temporary_path)
        .map_err(|error| {
            let _ = fs::remove_file(&temporary_path);
            format!("Yedek dosyası boyutu okunamadı: {error}")
        })?
        .len();
    if backup_size > MAX_BACKUP_TOTAL_BYTES {
        let _ = fs::remove_file(&temporary_path);
        return Err(format!(
            "Yedek dosyası {} MB toplam saklama sınırını tek başına aşıyor.",
            MAX_BACKUP_TOTAL_BYTES / (1024 * 1024)
        ));
    }

    fs::rename(&temporary_path, &backup_path).map_err(|error| {
        let _ = fs::remove_file(&temporary_path);
        format!("Doğrulanan yedek yayımlanamadı: {error}")
    })?;

    prune_backups(&backup_directory)?;
    collect_overview(&backup_directory)
}

fn list_progress_backups_sync(app: &tauri::AppHandle) -> Result<ProgressBackupOverview, String> {
    let backup_directory = backup_directory(app)?;
    prune_backups(&backup_directory)?;
    collect_overview(&backup_directory)
}

fn restore_progress_backup_sync(
    app: &tauri::AppHandle,
    backup_id: &str,
) -> Result<ProgressRestoreResult, String> {
    let backup_directory = backup_directory(app)?;
    let selected_backup = find_backup_candidate(&backup_directory, backup_id)?;
    let database_path = progress::database_path(app)?;
    let staged_path = restore_staging_path(&database_path);
    let previous_path = restore_previous_path(&database_path);
    remove_file_if_exists(&staged_path)?;
    remove_file_if_exists(&previous_path)?;

    fs::copy(&selected_backup.path, &staged_path)
        .map_err(|error| format!("Seçilen yedek geri yükleme alanına kopyalanamadı: {error}"))?;
    if let Err(error) = validate_backup_database(&staged_path, "Geri yüklenecek ilerleme yedeği") {
        let _ = fs::remove_file(&staged_path);
        return Err(error);
    }

    let safety_overview = create_progress_backup_sync(app).map_err(|error| {
        let _ = fs::remove_file(&staged_path);
        format!("Geri yükleme öncesi güvenlik yedeği oluşturulamadı: {error}")
    })?;
    let safety_backup_id = safety_overview
        .backups
        .first()
        .map(|backup| backup.id.clone())
        .ok_or_else(|| {
            let _ = fs::remove_file(&staged_path);
            "Geri yükleme öncesi güvenlik yedeği doğrulanamadı.".to_string()
        })?;

    let progress = replace_progress_database(&database_path, &staged_path, &previous_path)?;
    let backups = collect_overview(&backup_directory)?;

    Ok(ProgressRestoreResult {
        progress,
        backups,
        restored_backup_id: backup_id.to_string(),
        safety_backup_id,
    })
}

fn delete_progress_backup_sync(
    app: &tauri::AppHandle,
    backup_id: &str,
) -> Result<ProgressBackupOverview, String> {
    let backup_directory = backup_directory(app)?;
    let candidate = find_backup_candidate(&backup_directory, backup_id)?;
    fs::remove_file(&candidate.path)
        .map_err(|error| format!("Seçilen ilerleme yedeği silinemedi: {error}"))?;
    prune_backups(&backup_directory)?;
    collect_overview(&backup_directory)
}

fn replace_progress_database(
    database_path: &Path,
    staged_path: &Path,
    previous_path: &Path,
) -> Result<progress::ProgressSnapshot, String> {
    fs::rename(database_path, previous_path)
        .map_err(|error| format!("Mevcut ilerleme veritabanı güvenli alana taşınamadı: {error}"))?;

    if let Err(error) = remove_database_sidecars(database_path) {
        let _ = fs::rename(previous_path, database_path);
        let _ = fs::remove_file(staged_path);
        return Err(error);
    }

    if let Err(error) = fs::rename(staged_path, database_path) {
        let rollback = fs::rename(previous_path, database_path);
        return match rollback {
            Ok(()) => Err(format!("Yedek veritabanı etkinleştirilemedi: {error}")),
            Err(rollback_error) => Err(format!(
                "Yedek veritabanı etkinleştirilemedi ({error}) ve önceki veritabanı geri konamadı ({rollback_error})."
            )),
        };
    }

    let verification = validate_backup_database(database_path, "Geri yüklenen ilerleme veritabanı");
    if let Err(error) = verification {
        let _ = fs::remove_file(database_path);
        let _ = remove_database_sidecars(database_path);
        let rollback = fs::rename(previous_path, database_path);
        return match rollback {
            Ok(()) => Err(error),
            Err(rollback_error) => Err(format!(
                "{error} Önceki ilerleme veritabanı geri konamadı: {rollback_error}"
            )),
        };
    }

    let connection = Connection::open_with_flags(database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Geri yüklenen ilerleme veritabanı açılamadı: {error}"))?;
    let snapshot = progress::read_snapshot(&connection)?;
    drop(connection);
    let _ = fs::remove_file(previous_path);
    Ok(snapshot)
}

fn validate_backup_database(path: &Path, label: &str) -> Result<(), String> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("{label} doğrulama için açılamadı: {error}"))?;
    ensure_integrity(&connection, label)?;
    progress::read_snapshot(&connection)
        .map(|_| ())
        .map_err(|error| format!("{label} beklenen ilerleme şemasını içermiyor: {error}"))
}

fn collect_overview(directory: &Path) -> Result<ProgressBackupOverview, String> {
    let mut summaries = Vec::new();
    let mut total_bytes = 0_u64;

    for candidate in backup_candidates(directory)? {
        total_bytes = total_bytes.saturating_add(candidate.size_bytes);
        let id = candidate
            .path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("bilinmeyen-yedek")
            .to_string();
        let (integrity_status, completed_lesson_count, total_xp) = inspect_backup(&candidate.path);
        summaries.push(ProgressBackupSummary {
            id,
            created_at: candidate.created_at,
            size_bytes: candidate.size_bytes,
            integrity_status,
            completed_lesson_count,
            total_xp,
        });
    }

    summaries.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.id.cmp(&left.id))
    });

    Ok(ProgressBackupOverview {
        backups: summaries,
        max_backup_count: MAX_BACKUP_COUNT,
        max_total_bytes: MAX_BACKUP_TOTAL_BYTES,
        total_bytes,
    })
}

fn inspect_backup(path: &Path) -> (String, Option<i64>, Option<i64>) {
    let connection = match Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(connection) => connection,
        Err(_) => return ("corrupt".to_string(), None, None),
    };

    if ensure_integrity(&connection, "İlerleme yedeği").is_err() {
        return ("corrupt".to_string(), None, None);
    }

    let completed_lesson_count = connection
        .query_row("SELECT COUNT(*) FROM lesson_progress", [], |row| {
            row.get::<_, i64>(0)
        })
        .ok();
    let total_xp = connection
        .query_row(
            "SELECT COALESCE(SUM(xp_awarded), 0) FROM lesson_progress",
            [],
            |row| row.get::<_, i64>(0),
        )
        .ok();

    if completed_lesson_count.is_some() && total_xp.is_some() {
        ("ok".to_string(), completed_lesson_count, total_xp)
    } else {
        ("corrupt".to_string(), None, None)
    }
}

fn ensure_integrity(connection: &Connection, label: &str) -> Result<(), String> {
    let result = connection
        .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
        .map_err(|error| format!("{label} bütünlük kontrolü çalıştırılamadı: {error}"))?;
    if result.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(format!("{label} bütünlük kontrolünden geçemedi: {result}"))
    }
}

fn prune_backups(directory: &Path) -> Result<(), String> {
    for path in retention_removal_plan(backup_candidates(directory)?) {
        fs::remove_file(&path).map_err(|error| {
            format!(
                "Eski ilerleme yedeği silinemedi ({}): {error}",
                path.display()
            )
        })?;
    }
    Ok(())
}

fn retention_removal_plan(mut candidates: Vec<BackupCandidate>) -> Vec<PathBuf> {
    candidates.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.path.cmp(&left.path))
    });

    let mut retained_count = 0_usize;
    let mut retained_bytes = 0_u64;
    let mut removals = Vec::new();
    for candidate in candidates {
        let fits_count = retained_count < MAX_BACKUP_COUNT;
        let fits_size = retained_bytes
            .checked_add(candidate.size_bytes)
            .is_some_and(|value| value <= MAX_BACKUP_TOTAL_BYTES);
        if fits_count && fits_size {
            retained_count += 1;
            retained_bytes += candidate.size_bytes;
        } else {
            removals.push(candidate.path);
        }
    }
    removals
}

fn backup_candidates(directory: &Path) -> Result<Vec<BackupCandidate>, String> {
    let mut candidates = Vec::new();
    let entries =
        fs::read_dir(directory).map_err(|error| format!("Yedek klasörü okunamadı: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Yedek klasörü girdisi okunamadı: {error}"))?;
        let path = entry.path();
        if !path.is_file()
            || path.extension().and_then(|value| value.to_str()) != Some(BACKUP_EXTENSION)
        {
            continue;
        }
        let Some(filename) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Some(created_at) = backup_timestamp(filename) else {
            continue;
        };
        let size_bytes = entry
            .metadata()
            .map_err(|error| format!("Yedek dosyası bilgisi okunamadı: {error}"))?
            .len();
        candidates.push(BackupCandidate {
            path,
            created_at,
            size_bytes,
        });
    }

    Ok(candidates)
}

fn find_backup_candidate(directory: &Path, backup_id: &str) -> Result<BackupCandidate, String> {
    if !is_valid_backup_id(backup_id) {
        return Err("Geçersiz ilerleme yedeği kimliği.".to_string());
    }

    backup_candidates(directory)?
        .into_iter()
        .find(|candidate| {
            candidate.path.file_name().and_then(|value| value.to_str()) == Some(backup_id)
        })
        .ok_or_else(|| "Seçilen ilerleme yedeği bulunamadı.".to_string())
}

fn is_valid_backup_id(value: &str) -> bool {
    let Some(stem) = value
        .strip_prefix(BACKUP_PREFIX)
        .and_then(|value| value.strip_suffix(".db"))
    else {
        return false;
    };
    let mut parts = stem.split('-');
    let timestamp = parts.next().is_some_and(|part| {
        !part.is_empty() && part.chars().all(|character| character.is_ascii_digit())
    });
    let process_id = parts.next().is_some_and(|part| {
        !part.is_empty() && part.chars().all(|character| character.is_ascii_digit())
    });
    timestamp && process_id && parts.next().is_none()
}

fn next_backup_timestamp(directory: &Path) -> Result<i64, String> {
    let existing_max = backup_candidates(directory)?
        .into_iter()
        .map(|candidate| candidate.created_at)
        .max()
        .unwrap_or(0);
    let minimum = existing_max
        .checked_add(1)
        .ok_or_else(|| "Yedek zaman damgası güvenli aralığı aştı.".to_string())?
        .max(unix_timestamp_millis());

    loop {
        let previous = LAST_BACKUP_TIMESTAMP.load(Ordering::Acquire);
        let after_previous = previous
            .checked_add(1)
            .ok_or_else(|| "Yedek zaman damgası güvenli aralığı aştı.".to_string())?;
        let candidate = minimum.max(after_previous);
        match LAST_BACKUP_TIMESTAMP.compare_exchange(
            previous,
            candidate,
            Ordering::AcqRel,
            Ordering::Acquire,
        ) {
            Ok(_) => return Ok(candidate),
            Err(_) => continue,
        }
    }
}

fn restore_staging_path(database_path: &Path) -> PathBuf {
    database_path.with_extension(format!(
        "restore-{}-{}.tmp",
        std::process::id(),
        unix_timestamp_millis()
    ))
}

fn restore_previous_path(database_path: &Path) -> PathBuf {
    database_path.with_extension(format!("restore-previous-{}.db", std::process::id()))
}

fn remove_database_sidecars(database_path: &Path) -> Result<(), String> {
    for suffix in ["-wal", "-shm"] {
        let mut value: OsString = database_path.as_os_str().to_os_string();
        value.push(suffix);
        remove_file_if_exists(Path::new(&value))?;
    }
    Ok(())
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Geçici veri dosyası temizlenemedi: {error}")),
    }
}

fn backup_timestamp(filename: &str) -> Option<i64> {
    filename
        .strip_prefix(BACKUP_PREFIX)?
        .split('-')
        .next()?
        .parse::<i64>()
        .ok()
}

fn unix_timestamp_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

#[cfg(test)]
mod tests {
    use super::{
        backup_timestamp, is_valid_backup_id, retention_removal_plan, BackupCandidate,
        MAX_BACKUP_COUNT, MAX_BACKUP_TOTAL_BYTES,
    };
    use std::path::PathBuf;

    #[test]
    fn accepts_only_owned_backup_file_names() {
        assert!(is_valid_backup_id("progress-1722000000123-42.db"));
        assert!(!is_valid_backup_id("../progress-1722000000123-42.db"));
        assert!(!is_valid_backup_id("progress-1722000000123-42.db.tmp"));
        assert!(!is_valid_backup_id("progress-not-a-time-42.db"));
        assert!(!is_valid_backup_id("progress-1722000000123-42-extra.db"));
    }

    #[test]
    fn parses_timestamp_from_owned_backup_names() {
        assert_eq!(
            backup_timestamp("progress-1722000000123-42.db"),
            Some(1_722_000_000_123)
        );
        assert_eq!(backup_timestamp("notes.db"), None);
    }

    #[test]
    fn retention_keeps_only_the_newest_allowed_backups() {
        let candidates = (0..MAX_BACKUP_COUNT + 2)
            .map(|index| BackupCandidate {
                path: PathBuf::from(format!("progress-{index}-1.db")),
                created_at: index as i64,
                size_bytes: 1,
            })
            .collect();
        let removals = retention_removal_plan(candidates);
        assert_eq!(removals.len(), 2);
        assert!(removals.contains(&PathBuf::from("progress-0-1.db")));
        assert!(removals.contains(&PathBuf::from("progress-1-1.db")));
    }

    #[test]
    fn retention_enforces_total_size_even_under_the_count_limit() {
        let candidates = vec![
            BackupCandidate {
                path: PathBuf::from("progress-2-1.db"),
                created_at: 2,
                size_bytes: MAX_BACKUP_TOTAL_BYTES,
            },
            BackupCandidate {
                path: PathBuf::from("progress-1-1.db"),
                created_at: 1,
                size_bytes: 1,
            },
        ];
        let removals = retention_removal_plan(candidates);
        assert_eq!(removals, vec![PathBuf::from("progress-1-1.db")]);
    }

    #[test]
    fn rejected_large_candidates_do_not_consume_count_slots() {
        let candidates = vec![
            BackupCandidate {
                path: PathBuf::from("progress-7-1.db"),
                created_at: 7,
                size_bytes: 20 * 1024 * 1024,
            },
            BackupCandidate {
                path: PathBuf::from("progress-6-1.db"),
                created_at: 6,
                size_bytes: 10 * 1024 * 1024,
            },
            BackupCandidate {
                path: PathBuf::from("progress-5-1.db"),
                created_at: 5,
                size_bytes: 1024 * 1024,
            },
            BackupCandidate {
                path: PathBuf::from("progress-4-1.db"),
                created_at: 4,
                size_bytes: 1024 * 1024,
            },
            BackupCandidate {
                path: PathBuf::from("progress-3-1.db"),
                created_at: 3,
                size_bytes: 1024 * 1024,
            },
            BackupCandidate {
                path: PathBuf::from("progress-2-1.db"),
                created_at: 2,
                size_bytes: 1024 * 1024,
            },
        ];
        let removals = retention_removal_plan(candidates);
        assert_eq!(removals, vec![PathBuf::from("progress-6-1.db")]);
    }
}
