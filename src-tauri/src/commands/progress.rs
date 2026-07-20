use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressSnapshot {
    completed_lesson_ids: Vec<String>,
    total_xp: i64,
    last_lesson_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteLessonRequest {
    lesson_id: String,
    xp_reward: i64,
}

#[tauri::command]
pub async fn load_progress(app: tauri::AppHandle) -> Result<ProgressSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || load_progress_sync(&app))
        .await
        .map_err(|error| format!("İlerleme bilgisi okunamadı: {error}"))?
}

#[tauri::command]
pub async fn complete_lesson_progress(
    app: tauri::AppHandle,
    request: CompleteLessonRequest,
) -> Result<ProgressSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || complete_lesson_sync(&app, request))
        .await
        .map_err(|error| format!("Ders ilerlemesi kaydedilemedi: {error}"))?
}

#[tauri::command]
pub async fn set_last_lesson(
    app: tauri::AppHandle,
    lesson_id: String,
) -> Result<ProgressSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || set_last_lesson_sync(&app, &lesson_id))
        .await
        .map_err(|error| format!("Son ders kaydedilemedi: {error}"))?
}

fn open_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Uygulama veri klasörü bulunamadı: {error}"))?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Uygulama veri klasörü oluşturulamadı: {error}"))?;

    let connection = Connection::open(data_dir.join("python-farming.db"))
        .map_err(|error| format!("SQLite veritabanı açılamadı: {error}"))?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS lesson_progress (
               lesson_id TEXT PRIMARY KEY,
               completed_at INTEGER NOT NULL,
               xp_awarded INTEGER NOT NULL CHECK (xp_awarded >= 0)
             );
             CREATE TABLE IF NOT EXISTS app_state (
               key TEXT PRIMARY KEY,
               value TEXT NOT NULL
             );",
        )
        .map_err(|error| format!("SQLite şeması hazırlanamadı: {error}"))?;
    Ok(connection)
}

fn load_progress_sync(app: &tauri::AppHandle) -> Result<ProgressSnapshot, String> {
    let connection = open_database(app)?;
    read_snapshot(&connection)
}

fn complete_lesson_sync(
    app: &tauri::AppHandle,
    request: CompleteLessonRequest,
) -> Result<ProgressSnapshot, String> {
    if request.lesson_id.trim().is_empty() {
        return Err("Ders kimliği boş olamaz.".to_string());
    }
    if !(0..=10_000).contains(&request.xp_reward) {
        return Err("XP ödülü geçerli aralıkta değil.".to_string());
    }

    let mut connection = open_database(app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("SQLite işlemi başlatılamadı: {error}"))?;
    let completed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    transaction
        .execute(
            "INSERT OR IGNORE INTO lesson_progress (lesson_id, completed_at, xp_awarded)
             VALUES (?1, ?2, ?3)",
            params![request.lesson_id, completed_at, request.xp_reward],
        )
        .map_err(|error| format!("Ders tamamlanma kaydı yazılamadı: {error}"))?;
    transaction
        .execute(
            "INSERT INTO app_state (key, value) VALUES ('last_lesson_id', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![request.lesson_id],
        )
        .map_err(|error| format!("Son ders bilgisi yazılamadı: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("SQLite işlemi tamamlanamadı: {error}"))?;

    read_snapshot(&connection)
}

fn set_last_lesson_sync(
    app: &tauri::AppHandle,
    lesson_id: &str,
) -> Result<ProgressSnapshot, String> {
    if lesson_id.trim().is_empty() {
        return Err("Ders kimliği boş olamaz.".to_string());
    }

    let connection = open_database(app)?;
    connection
        .execute(
            "INSERT INTO app_state (key, value) VALUES ('last_lesson_id', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![lesson_id],
        )
        .map_err(|error| format!("Son ders bilgisi yazılamadı: {error}"))?;
    read_snapshot(&connection)
}

fn read_snapshot(connection: &Connection) -> Result<ProgressSnapshot, String> {
    let mut statement = connection
        .prepare("SELECT lesson_id FROM lesson_progress ORDER BY completed_at, lesson_id")
        .map_err(|error| format!("Ders ilerlemesi sorgulanamadı: {error}"))?;
    let completed_lesson_ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("Ders ilerlemesi okunamadı: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Ders ilerlemesi dönüştürülemedi: {error}"))?;

    let total_xp = connection
        .query_row(
            "SELECT COALESCE(SUM(xp_awarded), 0) FROM lesson_progress",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("Toplam XP okunamadı: {error}"))?;
    let last_lesson_id = connection
        .query_row(
            "SELECT value FROM app_state WHERE key = 'last_lesson_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Son ders bilgisi okunamadı: {error}"))?;

    Ok(ProgressSnapshot {
        completed_lesson_ids,
        total_xp,
        last_lesson_id,
    })
}

#[cfg(test)]
mod tests {
    use super::CompleteLessonRequest;

    #[test]
    fn complete_lesson_request_uses_expected_values() {
        let request = CompleteLessonRequest {
            lesson_id: "beginner.variables.introduction".to_string(),
            xp_reward: 40,
        };
        assert_eq!(request.lesson_id, "beginner.variables.introduction");
        assert_eq!(request.xp_reward, 40);
    }
}
