import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDiagnosticsReport } from "../../features/diagnostics/services/diagnosticsService";
import type { DiagnosticsSnapshot } from "../../features/diagnostics/types";
import { runtimeLimits } from "../../runtime/runtimeLimits";
import { runtimeProtocolVersion } from "../../runtime/runtimeProtocol";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

function rustConstant(source: string, name: string) {
  const value = source.match(new RegExp(`const ${name}: [^=]+ = ([^;]+);`))?.[1]?.trim();
  if (!value) {
    throw new Error(`${name} Rust sabiti bulunamadı.`);
  }

  return value
    .split("*")
    .map((part) => Number(part.replaceAll("_", "").trim()))
    .reduce((product, part) => product * part, 1);
}

const routes = read("src/app/routes.ts");
const router = read("src/app/AppRouter.tsx");
const rail = read("src/components/navigation/PrimaryRail.tsx");
const statusBar = read("src/components/navigation/StatusBar.tsx");
const settingsPage = read("src/pages/SettingsPage/SettingsPage.tsx");
const diagnosticsService = read("src/features/diagnostics/services/diagnosticsService.ts");
const diagnosticsStore = read("src/features/diagnostics/store/diagnosticsStore.ts");
const runtimeRust = read("src-tauri/src/commands/runtime.rs");

describe("settings and system diagnostics", () => {
  it("publishes a real lazy-loaded Settings route", () => {
    expect(routes).toContain('settings: "/settings"');
    expect(router).toContain('import("../pages/SettingsPage")');
    expect(router).toContain("route === routes.settings");
    expect(router).toContain('return "Ayarlar ve Sistem Tanılama"');
    expect(rail).toContain('{ label: "Ayarlar", symbol: "⚙", route: routes.settings }');
  });

  it("runs the existing backend health check and app-version commands", () => {
    expect(diagnosticsService).toContain('invoke<string>("app_version")');
    expect(diagnosticsService).toContain('kind: "health_check"');
    expect(diagnosticsService).toContain("protocolVersion: runtimeProtocolVersion");
    expect(diagnosticsService).toContain('environment: "browser-preview"');
    expect(diagnosticsStore).toContain("collectDiagnostics()");
    expect(diagnosticsStore).toContain("checkDiagnostics: async");
  });

  it("keeps displayed safety limits equal to the Rust runtime", () => {
    expect(runtimeLimits.protocolVersion).toBe(runtimeProtocolVersion);
    expect(runtimeLimits.maxSourceBytes).toBe(rustConstant(runtimeRust, "MAX_SOURCE_BYTES"));
    expect(runtimeLimits.maxStdinBytes).toBe(rustConstant(runtimeRust, "MAX_STDIN_BYTES"));
    expect(runtimeLimits.maxOutputBytes).toBe(rustConstant(runtimeRust, "MAX_OUTPUT_BYTES"));
    expect(runtimeLimits.minTimeoutMs).toBe(rustConstant(runtimeRust, "MIN_TIMEOUT_MS"));
    expect(runtimeLimits.maxTimeoutMs).toBe(rustConstant(runtimeRust, "MAX_TIMEOUT_MS"));
  });

  it("shows runtime, limits, progress and non-destructive troubleshooting", () => {
    expect(settingsPage).toContain("Python çalışma motoru");
    expect(settingsPage).toContain("Uygulama ve ortam");
    expect(settingsPage).toContain("Çalıştırma limitleri");
    expect(settingsPage).toContain("İlerleme kaydı");
    expect(settingsPage).toContain("PYTHON_FARMING_PYTHON");
    expect(settingsPage).toContain("Tanılama raporu öğrenci kodunu veya ders cevaplarını içermez");
    expect(settingsPage).not.toContain("deleteProgress");
    expect(settingsPage).not.toContain("İlerlemeyi sıfırla");
  });

  it("feeds the same diagnostics state into the global status bar", () => {
    expect(statusBar).toContain("useDiagnosticsStore");
    expect(statusBar).toContain("checkDiagnostics()");
    expect(statusBar).toContain("Python hazır");
    expect(statusBar).toContain("Python bulunamadı");
    expect(statusBar).toContain('data-status={status}');
  });

  it("creates a support report without source code or lesson answers", () => {
    const snapshot: DiagnosticsSnapshot = {
      environment: "desktop",
      appVersion: "0.1.0",
      platform: "TestOS x64",
      checkedAt: "2026-07-26T13:00:00.000Z",
      runtimeStatus: "ready",
      runtime: {
        status: "ready",
        version: "Python 3.13.5",
        executable: "python3",
        message: "Yerel Python yorumlayıcısı kullanıma hazır.",
      },
      diagnostics: [],
    };

    const report = createDiagnosticsReport(snapshot);

    expect(report).toContain("Python Farming Sistem Tanılama Raporu");
    expect(report).toContain("Python 3.13.5");
    expect(report).toContain("python3");
    expect(report).toContain("Runtime protokolü: 1");
    expect(report).toContain("Tanılama mesajı yok");
    expect(report).not.toContain("starterCode");
    expect(report).not.toContain("lesson answer");
  });
});
