use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

use super::{progress, progress_backup};

const EXPORT_FORMAT: &str = "python-farming-progress";
const EXPORT_SCHEMA_VERSION: u32 = 1;
const MAX_TRANSFER_BYTES: usize = 2 * 1024 * 1024;
const MAX_IMPORTED_LESSONS: usize = 10_000;
const MAX_LESSON_ID_BYTES: usize = 256;
const MAX_APP_VERSION_BYTES: usize = 64;
const RESET_CONFIRMATION: &str = "İLERLEMEMİ SIFIRLA";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressExportResult {
    file_name: String,
    file_path: String,
    size_bytes: u64,
    exported_at: i64,
    completed_lesson_count: usize,
    total_xp: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressMutationResult {
    snapshot: progress::ProgressSnapshot,
    backup_overview: progress_backup::ProgressBackupOverview,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProgressExportDocument {
    format: String,
    schema_version: u32,
    exported_at: i64,
    application_version: String,
    lessons: Vec<ExportedLesson>,
    last_lesson_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExportedLesson {
    lesson_id: String,
    completed_at: i64,
    xp_awarded: i64,
}

#[tauri::command]
pub async fn export_progress_data(app: tauri::AppHandle) -> Result<ProgressExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        progress_backup::with_backup_lock(|| export_progress_data_sync(&app))
    })
    .await
    .map_err(|error| format!("İlerleme verisi dışa aktarılamadı: {error}"))?
}

#[tauri::command]
pub async fn import_progress_data(
    app: tauri::AppHandle,
    payload: String,
) -> Result<ProgressMutationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        progress_backup::with_backup_lock(|| import_progress_data_sync(&app, &payload))
    })
    .await
    .map_err(|error| format!("İlerleme verisi içe aktarılamadı: {error}"))?
}

#[tauri::command]
pub async fn reset_progress_data(
    app: tauri::AppHandle,
    confirmation: String,
) -> Result<ProgressMutationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        progress_backup::with_backup_lock(|| reset_progress_data_sync(&app, &confirmation))
    })
    .await
    .map_err(|error| format!("İlerleme verisi sıfırlanamadı: {error}"))?
}

fn export_progress_data_sync(app: &tauri::AppHandle) -> Result<ProgressExportResult, String> {
    let connection = progress::open_database(app)?;
    let mut statement = connection
        .prepare(
            "SELECT lesson_id, completed_at, xp_awarded
             FROM lesson_progress
             ORDER BY completed_at, lesson_id",
        )
        .map_err(|error| format!("Dışa aktarılacak ders ilerlemesi hazırlanamadı: {error}"))?;
    let lessons = statement
        .query_map([], |row| {
            Ok(ExportedLesson {
                lesson_id: row.get(0)?,
                completed_at: row.get(1)?,
                xp_awarded: row.get(2)?,
            })
        })
        .map_err(|error| format!("Dışa aktarılacak ders ilerlemesi okunamadı: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Ders ilerlemesi dışa aktarma biçimine dönüştürülemedi: {error}"))?;
    let last_lesson_id = connection
        .query_row(
            "SELECT value FROM app_state WHERE key = 'last_lesson_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Son ders bilgisi dışa aktarılamadı: {error}"))?;
    let total_xp = lessons.iter().try_fold(0_i64, |total, lesson| {
        total
            .checked_add(lesson.xp_awarded)
            .ok_or_else(|| "Toplam XP güvenli sayı aralığını aşıyor.".to_string())
    })?;
    let exported_at = unix_timestamp_millis();
    let document = ProgressExportDocument {
        format: EXPORT_FORMAT.to_string(),
        schema_version: EXPORT_SCHEMA_VERSION,
        exported_at,
        application_version: env!("CARGO_PKG_VERSION").to_string(),
        lessons,
        last_lesson_id,
    };
    let serialized = serde_json::to_vec_pretty(&document)
        .map_err(|error| format!("İlerleme dışa aktarma dosyası oluşturulamadı: {error}"))?;
    if serialized.len() > MAX_TRANSFER_BYTES {
        return Err(format!(
            "İlerleme dışa aktarma dosyası {} MB güvenlik sınırını aşıyor.",
            MAX_TRANSFER_BYTES / (1024 * 1024)
        ));
    }

    let directory = export_directory(app)?;
    let file_name = format!(
        "python-farming-progress-{exported_at}-{}.json",
        std::process::id()
    );
    let file_path = directory.join(&file_name);
    let temporary_path = file_path.with_extension("json.tmp");
    cleanup_file(&temporary_path);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary_path)
        .map_err(|error| format!("Geçici dışa aktarma dosyası oluşturulamadı: {error}"))?;
    if let Err(error) = file.write_all(&serialized).and_then(|_| file.sync_all()) {
        drop(file);
        cleanup_file(&temporary_path);
        return Err(format!("İlerleme dışa aktarma dosyası yazılamadı: {error}"));
    }
    drop(file);
    fs::rename(&temporary_path, &file_path).map_err(|error| {
        cleanup_file(&temporary_path);
        format!("İlerleme dışa aktarma dosyası yayımlanamadı: {error}")
    })?;

    Ok(ProgressExportResult {
        file_name,
        file_path: file_path.to_string_lossy().to_string(),
        size_bytes: serialized.len() as u64,
        exported_at,
        completed_lesson_count: document.lessons.len(),
        total_xp,
    })
}

fn import_progress_data_sync(
    app: &tauri::AppHandle,
    payload: &str,
) -> Result<ProgressMutationResult, String> {
    if payload.as_bytes().len() > MAX_TRANSFER_BYTES {
        return Err(format!(
            "Seçilen dosya {} MB içe aktarma sınırını aşıyor.",
            MAX_TRANSFER_BYTES / (1024 * 1024)
        ));
    }
    let document: ProgressExportDocument = serde_json::from_str(payload)
        .map_err(|error| format!("Seçilen dosya geçerli Python Farming JSON verisi değil: {error}"))?;
    validate_export_document(&document)?;

    let backup_overview = progress_backup::create_progress_backup_sync(app)
        .map_err(|error| format!("İçe aktarma öncesi güvenlik yedeği oluşturulamadı: {error}"))?;
    let mut connection = progress::open_database(app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("İçe aktarma SQLite işlemi başlatılamadı: {error}"))?;
    transaction
        .execute("DELETE FROM lesson_progress", [])
        .map_err(|error| format!("Mevcut ders ilerlemesi içe aktarma için temizlenemedi: {error}"))?;
    transaction
        .execute("DELETE FROM app_state", [])
        .map_err(|error| format!("Mevcut uygulama durumu içe aktarma için temizlenemedi: {error}"))?;
    for lesson in &document.lessons {
        transaction
            .execute(
                "INSERT INTO lesson_progress (lesson_id, completed_at, xp_awarded)
                 VALUES (?1, ?2, ?3)",
                params![lesson.lesson_id, lesson.completed_at, lesson.xp_awarded],
            )
            .map_err(|error| format!("İçe aktarılan ders ilerlemesi yazılamadı: {error}"))?;
    }
    if let Some(last_lesson_id) = &document.last_lesson_id {
        transaction
            .execute(
                "INSERT INTO app_state (key, value) VALUES ('last_lesson_id', ?1)",
                [last_lesson_id],
            )
            .map_err(|error| format!("İçe aktarılan son ders bilgisi yazılamadı: {error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("İlerleme içe aktarma işlemi tamamlanamadı: {error}"))?;
    let snapshot = progress::read_snapshot(&connection)?;

    Ok(ProgressMutationResult {
        snapshot,
        backup_overview,
    })
}

fn reset_progress_data_sync(
    app: &tauri::AppHandle,
    confirmation: &str,
) -> Result<ProgressMutationResult, String> {
    if confirmation != RESET_CONFIRMATION {
        return Err(format!(
            "Sıfırlama için doğrulama metni tam olarak ‘{RESET_CONFIRMATION}’ olmalıdır."
        ));
    }
    let backup_overview = progress_backup::create_progress_backup_sync(app)
        .map_err(|error| format!("Sıfırlama öncesi güvenlik yedeği oluşturulamadı: {error}"))?;
    let mut connection = progress::open_database(app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Sıfırlama SQLite işlemi başlatılamadı: {error}"))?;
    transaction
        .execute("DELETE FROM lesson_progress", [])
        .map_err(|error| format!("Ders ilerlemesi sıfırlanamadı: {error}"))?;
    transaction
        .execute("DELETE FROM app_state", [])
        .map_err(|error| format!("Uygulama durumu sıfırlanamadı: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("İlerleme sıfırlama işlemi tamamlanamadı: {error}"))?;
    let snapshot = progress::read_snapshot(&connection)?;

    Ok(ProgressMutationResult {
        snapshot,
        backup_overview,
    })
}

fn validate_export_document(document: &ProgressExportDocument) -> Result<(), String> {
    if document.format != EXPORT_FORMAT {
        return Err("Dosya Python Farming ilerleme dışa aktarma biçiminde değil.".to_string());
    }
    if document.schema_version != EXPORT_SCHEMA_VERSION {
        return Err(format!(
            "İlerleme dosyası şema sürümü desteklenmiyor: {}.",
            document.schema_version
        ));
    }
    if document.exported_at < 0 {
        return Err("Dışa aktarma zaman damgası geçersiz.".to_string());
    }
    if document.application_version.is_empty()
        || document.application_version.len() > MAX_APP_VERSION_BYTES
    {
        return Err("Dışa aktarma uygulama sürümü geçersiz.".to_string());
    }
    if document.lessons.len() > MAX_IMPORTED_LESSONS {
        return Err(format!(
            "İçe aktarılan dosya en fazla {MAX_IMPORTED_LESSONS} ders içerebilir."
        ));
    }

    let mut lesson_ids = HashSet::with_capacity(document.lessons.len());
    let mut total_xp = 0_i64;
    for lesson in &document.lessons {
        validate_lesson_id(&lesson.lesson_id, "Ders kimliği")?;
        if !lesson_ids.insert(lesson.lesson_id.as_str()) {
            return Err(format!(
                "İçe aktarma dosyasında yinelenen ders kimliği var: {}.",
                lesson.lesson_id
            ));
        }
        if lesson.completed_at < 0 {
            return Err(format!(
                "{} dersi için tamamlanma zamanı geçersiz.",
                lesson.lesson_id
            ));
        }
        if !(0..=10_000).contains(&lesson.xp_awarded) {
            return Err(format!(
                "{} dersi için XP değeri güvenli aralıkta değil.",
                lesson.lesson_id
            ));
        }
        total_xp = total_xp
            .checked_add(lesson.xp_awarded)
            .ok_or_else(|| "İçe aktarılan toplam XP güvenli sayı aralığını aşıyor.".to_string())?;
    }
    if let Some(last_lesson_id) = &document.last_lesson_id {
        validate_lesson_id(last_lesson_id, "Son ders kimliği")?;
    }
    let _ = total_xp;
    Ok(())
}

fn validate_lesson_id(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || value.trim() != value
        || value.as_bytes().len() > MAX_LESSON_ID_BYTES
        || value.chars().any(char::is_control)
    {
        return Err(format!("{label} geçersiz."));
    }
    Ok(())
}

fn export_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(directory) = app.path().download_dir() {
        fs::create_dir_all(&directory)
            .map_err(|error| format!("İndirilenler klasörü hazırlanamadı: {error}"))?;
        return Ok(directory);
    }
    if let Ok(directory) = app.path().document_dir() {
        fs::create_dir_all(&directory)
            .map_err(|error| format!("Belgeler klasörü hazırlanamadı: {error}"))?;
        return Ok(directory);
    }
    let database_path = progress::database_path(app)?;
    let data_directory = database_path
        .parent()
        .ok_or_else(|| "Uygulama veri klasörü belirlenemedi.".to_string())?;
    let directory = data_directory.join("exports");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Dışa aktarma klasörü hazırlanamadı: {error}"))?;
    Ok(directory)
}

fn cleanup_file(path: &Path) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
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
        validate_export_document, ExportedLesson, ProgressExportDocument, EXPORT_FORMAT,
        EXPORT_SCHEMA_VERSION, MAX_IMPORTED_LESSONS,
    };

    fn valid_document() -> ProgressExportDocument {
        ProgressExportDocument {
            format: EXPORT_FORMAT.to_string(),
            schema_version: EXPORT_SCHEMA_VERSION,
            exported_at: 1_722_000_000_123,
            application_version: "0.1.0".to_string(),
            lessons: vec![ExportedLesson {
                lesson_id: "beginner.variables.introduction".to_string(),
                completed_at: 1_722_000_000,
                xp_awarded: 40,
            }],
            last_lesson_id: Some("beginner.variables.introduction".to_string()),
        }
    }

    #[test]
    fn accepts_versioned_progress_documents() {
        assert!(validate_export_document(&valid_document()).is_ok());
    }

    #[test]
    fn rejects_duplicate_lessons_and_unsafe_xp() {
        let mut duplicate = valid_document();
        duplicate.lessons.push(ExportedLesson {
            lesson_id: duplicate.lessons[0].lesson_id.clone(),
            completed_at: 1_722_000_001,
            xp_awarded: 45,
        });
        assert!(validate_export_document(&duplicate).is_err());

        let mut unsafe_xp = valid_document();
        unsafe_xp.lessons[0].xp_awarded = 10_001;
        assert!(validate_export_document(&unsafe_xp).is_err());
    }

    #[test]
    fn rejects_unknown_schema_and_oversized_lesson_sets() {
        let mut unknown_schema = valid_document();
        unknown_schema.schema_version += 1;
        assert!(validate_export_document(&unknown_schema).is_err());

        let mut oversized = valid_document();
        oversized.lessons = (0..=MAX_IMPORTED_LESSONS)
            .map(|index| ExportedLesson {
                lesson_id: format!("lesson.{index}"),
                completed_at: index as i64,
                xp_awarded: 1,
            })
            .collect();
        assert!(validate_export_document(&oversized).is_err());
    }
}
