import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) {
    throw new Error(`${path}: expected integration marker was not found`);
  }
  if (source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error(`${path}: integration marker is not unique`);
  }
  writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  "src-tauri/src/commands/progress.rs",
  "fn read_snapshot(connection: &Connection) -> Result<ProgressSnapshot, String> {",
  "pub(super) fn read_snapshot(connection: &Connection) -> Result<ProgressSnapshot, String> {",
);

replaceOnce(
  "src-tauri/src/commands/progress_backup.rs",
  "fn with_backup_lock<T>(operation: impl FnOnce() -> Result<T, String>) -> Result<T, String> {",
  "pub(super) fn with_backup_lock<T>(operation: impl FnOnce() -> Result<T, String>) -> Result<T, String> {",
);

replaceOnce(
  "src-tauri/src/commands/progress_backup.rs",
  "fn create_progress_backup_sync(app: &tauri::AppHandle) -> Result<ProgressBackupOverview, String> {",
  "pub(super) fn create_progress_backup_sync(\n    app: &tauri::AppHandle,\n) -> Result<ProgressBackupOverview, String> {",
);

replaceOnce(
  "src/pages/SettingsPage/SettingsPage.tsx",
  'import { ProgressBackupPanel } from "./ProgressBackupPanel";\n',
  'import { ProgressBackupPanel } from "./ProgressBackupPanel";\nimport { ProgressDataPanel } from "./ProgressDataPanel";\n',
);

replaceOnce(
  "src/pages/SettingsPage/SettingsPage.tsx",
  "          <ProgressBackupPanel />\n",
  "          <ProgressBackupPanel />\n          <ProgressDataPanel />\n",
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  'import styles from "./SettingsPage.module.css";\n',
  'import { progressBackupsChangedEvent } from "./ProgressDataPanel";\nimport styles from "./SettingsPage.module.css";\n',
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  "  useEffect(() => {\n    let active = true;\n    void listProgressBackups()",
  "  useEffect(() => {\n    let active = true;\n    const refreshBackups = () => {\n      void listProgressBackups()\n        .then((value) => {\n          if (!active) {\n            return;\n          }\n          setOverview(value);\n          setStatus(\"ready\");\n          setError(null);\n        })\n        .catch((reason: unknown) => {\n          if (!active) {\n            return;\n          }\n          setError(errorMessage(reason));\n          setStatus(\"error\");\n        });\n    };\n    refreshBackups();\n    window.addEventListener(progressBackupsChangedEvent, refreshBackups);\n    return () => {\n      active = false;\n      window.removeEventListener(progressBackupsChangedEvent, refreshBackups);\n    };\n  }, []);\n\n  /* initial loader retained below for patch removal */\n  useEffect(() => {\n    let active = false;\n    void Promise.resolve()",
);

replaceOnce(
  "src/pages/SettingsPage/ProgressBackupPanel.tsx",
  "  }, []);\n\n  const createBackup = async () => {",
  "  }, []);\n\n  const createBackup = async () => {",
);

const backupPath = "src/pages/SettingsPage/ProgressBackupPanel.tsx";
let backupSource = readFileSync(backupPath, "utf8");
const deadLoaderStart = backupSource.indexOf("  /* initial loader retained below for patch removal */");
const createBackupStart = backupSource.indexOf("  const createBackup = async () => {");
if (deadLoaderStart < 0 || createBackupStart < 0 || createBackupStart <= deadLoaderStart) {
  throw new Error("ProgressBackupPanel.tsx: temporary loader block could not be located");
}
backupSource = backupSource.slice(0, deadLoaderStart) + backupSource.slice(createBackupStart);
writeFileSync(backupPath, backupSource);

const cssPath = "src/pages/SettingsPage/SettingsPage.module.css";
const css = readFileSync(cssPath, "utf8");
if (!css.includes(".hiddenFileInput")) {
  writeFileSync(
    cssPath,
    `${css}\n.hiddenFileInput {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  overflow: hidden;\n  clip: rect(0 0 0 0);\n  clip-path: inset(50%);\n  white-space: nowrap;\n}\n\n.textInput {\n  width: 100%;\n  margin: var(--space-3) 0;\n  padding: 11px var(--space-3);\n  border: 1px solid var(--color-border);\n  border-radius: var(--radius-md);\n  background: var(--color-surface-raised);\n  color: var(--color-text-primary);\n  font-family: var(--font-mono);\n}\n\n.textInput:focus-visible {\n  outline: 2px solid var(--color-accent);\n  outline-offset: 2px;\n}\n\n.dangerBox {\n  margin-top: var(--space-4);\n  padding: var(--space-4);\n  border: 1px solid rgba(224, 108, 117, 0.4);\n  border-radius: var(--radius-md);\n  background: rgba(224, 108, 117, 0.08);\n}\n\n.dangerBox strong {\n  color: #f19a9f;\n}\n\n.dangerBox p {\n  color: var(--color-text-muted);\n  font-size: 11px;\n  line-height: 1.6;\n}\n`,
  );
}

const readmePath = "README.md";
let readme = readFileSync(readmePath, "utf8");
readme = readme.replace(
  "**35 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı.**",
  "**37 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı.**",
);
readme = readme.replace(
  "- Bütünlük kontrollü yerel ilerleme yedekleri ve sınırlı retention",
  "- Bütünlük kontrollü yerel ilerleme yedekleri, geri yükleme ve kontrollü silme\n- Sürümlü JSON ile ilerleme dışa aktarma, içe alma ve güvenli sıfırlama",
);
readme = readme.replace(
  "Bu aşama yalnız yedek oluşturma ve listelemeyi kapsar; geri yükleme ve yedek silme ayrı sağlamlaştırma aşamasında eklenecektir.",
  "Ayarlar ekranı yedek oluşturma, bütünlük denetimi, geri yükleme, kontrollü silme, sürümlü JSON dışa/içe aktarma ve güvenli sıfırlama akışlarını içerir. İçe aktarma ve sıfırlamadan önce mevcut SQLite kaydı otomatik güvenlik yedeğine alınır.",
);
writeFileSync(readmePath, readme);
