import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

const rustPortability = read("src-tauri/src/commands/progress_portability.rs");
const rustBackup = read("src-tauri/src/commands/progress_backup.rs");
const rustProgress = read("src-tauri/src/commands/progress.rs");
const rustCommands = read("src-tauri/src/commands/mod.rs");
const rustLib = read("src-tauri/src/lib.rs");
const portabilityService = read(
  "src/features/progress/services/progressPortabilityService.ts",
);
const operationStore = read(
  "src/features/progress/store/progressOperationStore.ts",
);
const portabilityPanel = read("src/pages/SettingsPage/ProgressDataPanel.tsx");
const backupPanel = read("src/pages/SettingsPage/ProgressBackupPanel.tsx");
const settingsPage = read("src/pages/SettingsPage/SettingsPage.tsx");

describe("progress portability and controlled reset contract", () => {
  it("registers dedicated export, import and reset commands", () => {
    expect(rustCommands).toContain("pub mod progress_portability");
    expect(rustLib).toContain("commands::progress_portability::export_progress_data");
    expect(rustLib).toContain("commands::progress_portability::import_progress_data");
    expect(rustLib).toContain("commands::progress_portability::reset_progress_data");
    expect(portabilityService).toContain('"export_progress_data"');
    expect(portabilityService).toContain('"import_progress_data"');
    expect(portabilityService).toContain('"reset_progress_data"');
  });

  it("exports a versioned bounded document without student source code", () => {
    expect(rustPortability).toContain('const EXPORT_FORMAT: &str = "python-farming-progress"');
    expect(rustPortability).toContain("const EXPORT_SCHEMA_VERSION: u32 = 1");
    expect(rustPortability).toContain("const MAX_TRANSFER_BYTES: usize = 2 * 1024 * 1024");
    expect(rustPortability).toContain("lesson_id, completed_at, xp_awarded");
    expect(rustPortability).toContain("application_version");
    expect(rustPortability).toContain("last_lesson_id");
    expect(rustPortability).toContain("to_vec_pretty");
    expect(rustPortability).toContain("file.sync_all()");
    expect(rustPortability).toContain('with_extension("json.tmp")');
    expect(rustPortability).not.toContain("starterCode");
    expect(rustPortability).not.toContain("userCode");
  });

  it("falls back across writable export directories", () => {
    expect(rustPortability).toContain("fn export_directories");
    expect(rustPortability).toContain("fn write_export_file");
    expect(rustPortability).toContain("app.path().download_dir()");
    expect(rustPortability).toContain("app.path().document_dir()");
    expect(rustPortability).toContain('data_directory.join("exports")');
    expect(rustPortability).toContain("for directory in export_directories(app)?");
    expect(rustPortability).toContain("failures.push");
    expect(rustPortability).toContain("continue;");
    expect(rustPortability).toContain(
      "Downloads, Documents veya uygulama veri klasörüne yazılamadı",
    );
  });

  it("validates imports before replacing SQLite progress", () => {
    expect(rustPortability).toContain("deny_unknown_fields");
    expect(rustPortability).toContain("MAX_IMPORTED_LESSONS");
    expect(rustPortability).toContain("HashSet");
    expect(rustPortability).toContain("yinelenen ders kimliği");
    expect(rustPortability).toContain("(0..=10_000).contains(&lesson.xp_awarded)");
    expect(rustPortability).toContain("validate_lesson_id");
    expect(rustPortability).toContain("create_progress_backup_sync(app)");
    expect(rustPortability).toContain("transaction()");
    expect(rustPortability).toContain('execute("DELETE FROM lesson_progress"');
    expect(rustPortability).toContain('execute("DELETE FROM app_state"');
    expect(rustPortability).toContain(".commit()");
    expect(rustProgress).toContain("pub(super) fn read_snapshot");
    expect(rustBackup).toContain("pub(super) fn with_backup_lock");
    expect(rustBackup).toContain("pub(super) fn create_progress_backup_sync");
  });

  it("serializes every progress writer with backup and portability operations", () => {
    expect(rustProgress).toContain("static PROGRESS_OPERATION_LOCK: Mutex<()>");
    expect(rustProgress).toContain("pub(super) fn with_progress_lock");
    expect(rustProgress).toContain(
      "with_progress_lock(|| complete_lesson_sync(&app, request))",
    );
    expect(rustProgress).toContain(
      "with_progress_lock(|| set_last_lesson_sync(&app, &lesson_id))",
    );
    expect(rustBackup).toContain("progress::with_progress_lock(operation)");
    expect(rustPortability).toContain("progress_backup::with_backup_lock");
  });

  it("requires typed reset confirmation and creates a recovery backup", () => {
    expect(rustPortability).toContain('const RESET_CONFIRMATION: &str = "İLERLEMEMİ SIFIRLA"');
    expect(rustPortability).toContain("confirmation != RESET_CONFIRMATION");
    expect(rustPortability).toContain("Sıfırlama öncesi güvenlik yedeği");
    expect(portabilityPanel).toContain("progressTransferPolicy.resetConfirmation");
    expect(portabilityPanel).toContain("Sıfırlamayı onayla");
    expect(portabilityPanel).toContain("resetConfirmation !==");
    expect(portabilityPanel).toContain("Önceki kayıt otomatik güvenlik yedeği");
  });

  it("coordinates destructive actions across both settings panels", () => {
    expect(operationStore).toContain("activeOperation");
    expect(operationStore).toContain("tryBeginOperation");
    expect(operationStore).toContain("finishOperation");
    expect(operationStore).toContain('"backup-restore"');
    expect(operationStore).toContain('"data-import"');
    expect(operationStore).toContain('"data-reset"');
    expect(portabilityPanel).toContain("useProgressOperationStore");
    expect(portabilityPanel).toContain('tryBeginOperation("data-import")');
    expect(portabilityPanel).toContain('finishOperation("data-import")');
    expect(backupPanel).toContain("useProgressOperationStore");
    expect(backupPanel).toContain('tryBeginOperation("backup-restore")');
    expect(backupPanel).toContain('finishOperation("backup-restore")');
    expect(backupPanel).toContain("activeOperation !== null");
  });

  it("refreshes live progress and backup state after destructive changes", () => {
    expect(portabilityPanel).toContain("loadProgress");
    expect(portabilityPanel).toContain("progressBackupsChangedEvent");
    expect(portabilityPanel).toContain("window.dispatchEvent");
    expect(backupPanel).toContain("window.addEventListener(progressBackupsChangedEvent");
    expect(backupPanel).toContain("window.removeEventListener(progressBackupsChangedEvent");
    expect(settingsPage).toContain("<ProgressDataPanel />");
  });

  it("keeps browser preview read-only and checks payload size twice", () => {
    expect(portabilityService).toContain("requireDesktopPortability");
    expect(portabilityService).toContain("maxPayloadBytes: 2 * 1024 * 1024");
    expect(portabilityService).toContain("yalnız Tauri masaüstü uygulamasında");
    expect(portabilityPanel).toContain("file.size > progressTransferPolicy.maxPayloadBytes");
    expect(portabilityPanel).toContain("Tarayıcı ön izlemesi yerel dosyalara yazmaz");
    expect(rustPortability).toContain("payload.as_bytes().len() > MAX_TRANSFER_BYTES");
    expect(portabilityPanel).toContain('role="alert"');
    expect(portabilityPanel).toContain('aria-live="polite"');
  });
});
