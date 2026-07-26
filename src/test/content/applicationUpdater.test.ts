import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

const service = read("src/features/updater/services/updateService.ts");
const store = read("src/features/updater/store/updateStore.ts");
const panel = read("src/pages/SettingsPage/ApplicationUpdatePanel.tsx");
const settings = read("src/pages/SettingsPage/SettingsPage.tsx");
const lib = read("src-tauri/src/lib.rs");
const capability = read("src-tauri/capabilities/default.json");

describe("signed application updater", () => {
  it("registers only the updater and restart plugin permissions", () => {
    expect(lib).toContain("tauri_plugin_updater::Builder::new().build()");
    expect(lib).toContain("tauri_plugin_process::init()");
    expect(capability).toContain('"updater:default"');
    expect(capability).toContain('"process:allow-restart"');
    expect(capability).not.toContain('"process:allow-exit"');
  });

  it("does not automatically check, download or install updates", () => {
    expect(panel).toContain("Güncellemeleri denetle");
    expect(panel).toContain("Kurulum ayrıntılarını göster");
    expect(panel).toContain("Yedekle, indir ve yeniden başlat");
    expect(panel).toContain("confirmationOpen");
    expect(settings).toContain("<ApplicationUpdatePanel />");
    expect(settings).not.toContain("checkForApplicationUpdate()");
  });

  it("backs up progress before downloading and installing", () => {
    const backupIndex = service.indexOf("await createProgressBackup()");
    const installIndex = service.indexOf("await update.downloadAndInstall");
    expect(backupIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(backupIndex);
    expect(service).toContain("await relaunch()");
  });

  it("disables browser update operations and rejects concurrent actions", () => {
    expect(service).toContain("if (!isTauriEnvironment())");
    expect(store).toContain('["checking", "downloading", "installing", "restarting"]');
    expect(store).toContain('get().status !== "available"');
    expect(panel).toContain("disabled={!desktop || busy}");
  });

  it("limits remote release notes and reports accessible progress", () => {
    expect(service).toContain("slice(0, 4_000)");
    expect(panel).toContain('aria-live="polite"');
    expect(panel).toContain('role={status === "error" ? "alert" : "status"}');
    expect(panel).toContain("<progress");
  });
});
