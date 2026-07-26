import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

const rustBackup = read("src-tauri/src/commands/progress_backup.rs");
const rustProgress = read("src-tauri/src/commands/progress.rs");
const rustCommands = read("src-tauri/src/commands/mod.rs");
const rustLib = read("src-tauri/src/lib.rs");
const progressService = read("src/features/progress/services/progressService.ts");
const backupPanel = read("src/pages/SettingsPage/ProgressBackupPanel.tsx");
const settingsPage = read("src/pages/SettingsPage/SettingsPage.tsx");

describe("local progress backup contract", () => {
  it("registers dedicated list and create commands without exposing restore yet", () => {
    expect(rustCommands).toContain("pub mod progress_backup");
    expect(rustLib).toContain("commands::progress_backup::list_progress_backups");
    expect(rustLib).toContain("commands::progress_backup::create_progress_backup");
    expect(rustLib).not.toContain("restore_progress_backup");
    expect(rustLib).not.toContain("delete_progress_backup");
  });

  it("creates, verifies and atomically publishes a consistent SQLite snapshot", () => {
    expect(rustProgress).toContain("pub(super) fn database_path");
    expect(rustProgress).toContain("pub(super) fn open_database");
    expect(rustBackup).toContain('execute_batch("PRAGMA wal_checkpoint(FULL);")');
    expect(rustBackup).toContain("VACUUM INTO");
    expect(rustBackup).toContain('query_row("PRAGMA quick_check"');
    expect(rustBackup).toContain("Oluşturulan ilerleme yedeği");
    expect(rustBackup).toContain('with_extension("db.tmp")');
    expect(rustBackup).toContain("fs::remove_file(&temporary_path)");
    expect(rustBackup).toContain("fs::rename(&temporary_path, &backup_path)");
  });

  it("enforces bounded retention without deleting the new backup after clock rollback", () => {
    expect(rustBackup).toContain("const MAX_BACKUP_COUNT: usize = 5");
    expect(rustBackup).toContain("const MAX_BACKUP_TOTAL_BYTES: u64 = 25 * 1024 * 1024");
    expect(rustBackup).toContain("retention_removal_plan");
    expect(rustBackup).toContain("retained_count");
    expect(rustBackup).toContain("next_backup_timestamp");
    expect(rustBackup).toContain("LAST_BACKUP_TIMESTAMP.compare_exchange");
    expect(rustBackup).toContain("existing_max");
    expect(rustBackup).toContain("prune_backups");
    expect(progressService).toContain("maxBackupCount: 5");
    expect(progressService).toContain("maxTotalBytes: 25 * 1024 * 1024");
  });

  it("keeps browser preview read-only and exposes every integrity failure", () => {
    expect(progressService).toContain("available: false");
    expect(progressService).toContain("yalnız Tauri masaüstü uygulamasında");
    expect(backupPanel).toContain('progressStatus !== "ready"');
    expect(backupPanel).toContain("İlerleme yedeği oluşturuldu ve bütünlük kontrolünden geçti");
    expect(backupPanel).toContain("corruptBackupCount");
    expect(backupPanel).toContain("Tüm yedeklerin bütünlüğü");
    expect(backupPanel).toContain("yerel yedek bütünlük kontrolünden geçemedi");
    expect(backupPanel).toContain('role="alert"');
    expect(settingsPage).toContain("<ProgressBackupPanel />");
  });
});
