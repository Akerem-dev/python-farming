import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, before, after) {
  const source = await readFile(path, "utf8");
  if (!source.includes(before)) throw new Error(`${path}: patch marker not found`);
  await writeFile(path, source.replace(before, after));
}

await replaceOnce(
  "src/pages/SettingsPage/SettingsPage.tsx",
  'import { ProgressDataPanel } from "./ProgressDataPanel";\n',
  'import { ProgressDataPanel } from "./ProgressDataPanel";\nimport { ApplicationUpdatePanel } from "./ApplicationUpdatePanel";\n',
);
await replaceOnce(
  "src/pages/SettingsPage/SettingsPage.tsx",
  '          <ProgressBackupPanel />\n          <ProgressDataPanel />\n',
  '          <ProgressBackupPanel />\n          <ProgressDataPanel />\n          <ApplicationUpdatePanel />\n',
);

const cssPath = "src/pages/SettingsPage/SettingsPage.module.css";
const css = await readFile(cssPath, "utf8");
if (!css.includes(".updateActions")) {
  await writeFile(
    cssPath,
    `${css.trimEnd()}\n\n.updateActions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--space-3);\n  margin-top: var(--space-4);\n}\n\n.updateProgress {\n  display: grid;\n  gap: var(--space-2);\n  margin-top: var(--space-4);\n}\n\n.updateProgress progress {\n  width: 100%;\n  height: 8px;\n  accent-color: var(--color-accent);\n}\n\n.updateProgress span {\n  color: var(--color-text-dim);\n  font-family: var(--font-mono);\n  font-size: 10px;\n}\n\n.updateRelease {\n  margin-top: var(--space-4);\n  padding: var(--space-4);\n  border: 1px solid rgba(85, 197, 138, 0.3);\n  border-radius: var(--radius-md);\n  background: rgba(85, 197, 138, 0.06);\n}\n\n.updateRelease > div {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: var(--space-3);\n}\n\n.updateRelease strong {\n  color: var(--color-success);\n}\n\n.updateRelease span {\n  color: var(--color-text-dim);\n  font-size: 10px;\n}\n\n.updateRelease p {\n  max-height: 180px;\n  margin: var(--space-3) 0 0;\n  overflow: auto;\n  color: var(--color-text-muted);\n  font-size: 11px;\n  line-height: 1.6;\n  white-space: pre-wrap;\n}\n`,
  );
}

await replaceOnce(
  "src-tauri/src/lib.rs",
  "    tauri::Builder::default()\n        .invoke_handler",
  "    tauri::Builder::default()\n        .plugin(tauri_plugin_updater::Builder::new().build())\n        .plugin(tauri_plugin_process::init())\n        .invoke_handler",
);

const capabilityPath = "src-tauri/capabilities/default.json";
const capability = JSON.parse(await readFile(capabilityPath, "utf8"));
capability.permissions = Array.from(
  new Set([...capability.permissions, "updater:default", "process:allow-restart"]),
);
await writeFile(capabilityPath, `${JSON.stringify(capability, null, 2)}\n`);
