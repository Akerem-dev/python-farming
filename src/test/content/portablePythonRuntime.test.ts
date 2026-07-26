import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

const preparer = read("scripts/prepare-portable-python.mjs");
const tauriConfig = read("src-tauri/tauri.conf.json");
const packageJson = read("package.json");
const interpreter = read("src-tauri/src/commands/python_interpreter.rs");
const runtime = read("src-tauri/src/commands/runtime.rs");
const projectRuntime = read("src-tauri/src/commands/project_runtime.rs");
const runtimeProtocol = read("src/runtime/runtimeProtocol.ts");
const diagnosticsService = read("src/features/diagnostics/services/diagnosticsService.ts");
const settingsPage = read("src/pages/SettingsPage/SettingsPage.tsx");
const ciWorkflow = read(".github/workflows/ci.yml");
const releaseWorkflow = read(".github/workflows/release.yml");
const readme = read("README.md");

describe("portable Python runtime contract", () => {
  it("pins an immutable release and verifies the published SHA-256 digest", () => {
    expect(preparer).toContain('"20260510"');
    expect(preparer).toContain('"3.13"');
    expect(preparer).toContain("install_only_stripped");
    expect(preparer).toContain('asset.digest.startsWith("sha256:")');
    expect(preparer).toContain("actual !== expected");
    expect(preparer).toContain("releaseAssets()");
    expect(preparer).toContain("matches.length !== 1");
  });

  it("supports every release target and prepares a Tauri resource", () => {
    for (const target of [
      "x86_64-pc-windows-msvc",
      "x86_64-unknown-linux-gnu",
      "aarch64-apple-darwin",
      "x86_64-apple-darwin",
    ]) {
      expect(preparer).toContain(target);
      expect(releaseWorkflow).toContain(`runtimeTarget: ${target}`);
    }
    expect(packageJson).toContain('"prepare:runtime"');
    expect(tauriConfig).toContain("npm run prepare:runtime && npm run build");
    expect(tauriConfig).toContain("python-runtime/**/*");
    expect(releaseWorkflow).toContain("PYTHON_FARMING_RUNTIME_TARGET");
  });

  it("discovers the extracted executable and records a safe relative manifest path", () => {
    expect(preparer).toContain("discoverRuntimeExecutable");
    expect(preparer).toContain("executableRelativePath");
    expect(preparer).toContain("safeManifestExecutable");
    expect(preparer).toContain('join(runtimeDirectory, "python", "bin")');
    expect(interpreter).toContain('const RUNTIME_MANIFEST: &str = "runtime-manifest.json"');
    expect(interpreter).toContain("executable_relative_path");
    expect(interpreter).toContain("validated_relative_executable");
    expect(interpreter).toContain("Component::Normal");
  });

  it("selects override, bundled runtime and system fallback in that order", () => {
    const overrideIndex = interpreter.indexOf("PYTHON_FARMING_PYTHON");
    const bundledIndex = interpreter.indexOf("candidates.extend(bundled_candidates(app))");
    const systemIndex = interpreter.indexOf("candidates.extend(system_candidates())");
    expect(overrideIndex).toBeGreaterThan(-1);
    expect(bundledIndex).toBeGreaterThan(overrideIndex);
    expect(systemIndex).toBeGreaterThan(bundledIndex);
    expect(interpreter).toContain('Self::Bundled => "bundled"');
    expect(interpreter).toContain("resource_dir()");
    expect(interpreter).toContain("astral-sh/python-build-standalone");
  });

  it("uses the same interpreter resolver for single and multi-file execution", () => {
    expect(runtime).toContain("find_python_interpreter(app)");
    expect(projectRuntime).toContain("find_python_interpreter(app)");
    expect(runtime).toContain("app: tauri::AppHandle");
    expect(projectRuntime).toContain("app: tauri::AppHandle");
    expect(runtime).not.toContain("fn interpreter_candidates()");
    expect(projectRuntime).not.toContain("fn interpreter_candidates()");
  });

  it("reports whether Python is bundled and managed by the application", () => {
    expect(runtimeProtocol).toContain('"bundled" | "custom" | "system"');
    expect(runtimeProtocol).toContain("managed?: boolean");
    expect(runtime).toContain("source: Some(interpreter.source.as_str().to_string())");
    expect(runtime).toContain("managed: interpreter.source.is_managed()");
    expect(diagnosticsService).toContain("Python kaynağı");
    expect(settingsPage).toContain("Uygulamaya gömülü");
    expect(settingsPage).toContain("runtimeSourceLabel");
  });

  it("opens the built Debian package and executes the manifest-selected interpreter", () => {
    expect(ciWorkflow).toContain("dpkg-deb -x");
    expect(ciWorkflow).toContain("executableRelativePath");
    expect(ciWorkflow).toContain("import asyncio, json, sqlite3");
    expect(ciWorkflow).toContain("portable-runtime-ok");
    expect(readme).toContain("38 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı");
  });
});
