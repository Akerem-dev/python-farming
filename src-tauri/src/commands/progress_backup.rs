use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use super::progress;

const BACKUP_DIRECTORY: &str = "backups";
const BACKUP_PREFIX: &str = "progress-";
const BACKUP_EXTENSION: &str = "db";
const MAX_BACKUP_COUNT: usize = 5;
const MAX_BACKUP_TOTAL_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Clone, Debug)]
struct BackupCandidate {
    path: PathBuf,
    created_at: i64,
    size_bytes: u64,
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

#[tauri::command]
pub async fn list_progress_backups(
    app: tauri::AppHandle,
) -> Result<ProgressBackupOverview, String> {
    tauri::async_runtime::spawn_blocking(move || list_progress_backups_sync(&app))
        .await
        .map_err(|error| format!("İlerleme yedekleri listelenemedi: {error}"))?
}

#[tauri::command]
pub async fn create_progress_backup(
    app: tauri::AppHandle,
) -> Result<ProgressBackupOverview, String> {
    tauri::async_runtime::spawn_blocking(move || create_progress_backup_sync(&app))
        .await
        .map_err(|error| format!("İlerleme yedeği oluşturulamadı: {error}"))?
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
    let created_at = unix_timestamp_millis();
    let filename = format!(
        "{BACKUP_PREFIX}{created_at}-{}.{}",
        std::process::id(),
        BACKUP_EXTENSION
    );
    let backup_path = backup_directory.join(&filename);
    let escaped_path = backup_path.to_string_lossy().replace('\'', "''");

    source
        .execute_batch(&format!("VACUUM INTO '{escaped_path}';"))
        .map_err(|error| format!("Tutarlı SQLite yedeği oluşturulamadı: {error}"))?;
    drop(source);

    let backup_connection =
        Connection::open_with_flags(&backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| format!("Oluşturulan yedek doğrulama için açılamadı: {error}"))?;
    if let Err(error) = ensure_integrity(&backup_connection, "Oluşturulan ilerleme yedeği") {
        drop(backup_connection);
        let _ = fs::remove_file(&backup_path);
        return Err(error);
    }
    drop(backup_connection);

    let backup_size = fs::metadata(&backup_path)
        .map_err(|error| format!("Yedek dosyası boyutu okunamadı: {error}"))?
        .len();
    if backup_size > MAX_BACKUP_TOTAL_BYTES {
        let _ = fs::remove_file(&backup_path);
        return Err(format!(
            "Yedek dosyası {} MB toplam saklama sınırını tek başına aşıyor.",
            MAX_BACKUP_TOTAL_BYTES / (1024 * 1024)
        ));
    }

    prune_backups(&backup_directory)?;
    collect_overview(&backup_directory)
}

fn list_progress_backups_sync(app: &tauri::AppHandle) -> Result<ProgressBackupOverview, String> {
    let backup_directory = backup_directory(app)?;
    prune_backups(&backup_directory)?;
    collect_overview(&backup_directory)
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
        backup_timestamp, retention_removal_plan, BackupCandidate, MAX_BACKUP_COUNT,
        MAX_BACKUP_TOTAL_BYTES,
    };
    use std::path::PathBuf;

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
}
