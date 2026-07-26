import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

const sandbox = read("src-tauri/src/commands/execution_sandbox.rs");
const runtime = read("src-tauri/src/commands/runtime.rs");
const projectRuntime = read("src-tauri/src/commands/project_runtime.rs");
const protocol = read("src/runtime/runtimeProtocol.ts");
const diagnostics = read("src/features/diagnostics/services/diagnosticsService.ts");
const settings = read("src/pages/SettingsPage/SettingsPage.tsx");
const readme = read("README.md");
const checklist = read("docs/RELEASE_CHECKLIST.md");

describe("shared runtime isolation contract", () => {
  it("runs single and multi-file code through one sandbox runner", () => {
    expect(runtime).toContain("PYTHON_SANDBOX_RUNNER");
    expect(projectRuntime).toContain("PYTHON_SANDBOX_RUNNER");
    expect(runtime).toContain("configure_sandbox_command");
    expect(projectRuntime).toContain("configure_sandbox_command");
    expect(runtime).toContain("wait_for_sandboxed_child");
    expect(projectRuntime).toContain("wait_for_sandboxed_child");
    expect(runtime).not.toContain("fn wait_for_child");
    expect(projectRuntime).not.toContain("fn wait_for_child");
  });

  it("blocks filesystem escape, network, subprocess and native loading events", () => {
    expect(sandbox).toContain("Çalışma alanı dışındaki dosyalar okunamaz");
    expect(sandbox).toContain("Çalışma alanı dışına dosya yazılamaz");
    expect(sandbox).toContain("event.startswith('socket.')");
    expect(sandbox).toContain("'subprocess.Popen'");
    expect(sandbox).toContain("'os.fork'");
    expect(sandbox).toContain("'ctypes.dlopen'");
    expect(sandbox).toContain("event == 'os.symlink'");
    expect(sandbox).toContain("sys.addaudithook(audit)");
  });

  it("clears inherited environment values and redirects user directories", () => {
    expect(sandbox).toContain("command.env_clear()");
    expect(sandbox).toContain('.env("HOME", workspace_text)');
    expect(sandbox).toContain('.env("USERPROFILE", workspace_text)');
    expect(sandbox).toContain('.env("PATH", "")');
    expect(sandbox).toContain('.env("PYTHONNOUSERSITE", "1")');
    expect(sandbox).toContain('.env("PYTHONHASHSEED", "0")');
  });

  it("terminates the whole process tree on timeout or workspace abuse", () => {
    expect(sandbox).toContain("command.process_group(0)");
    expect(sandbox).toContain("CREATE_NEW_PROCESS_GROUP");
    expect(sandbox).toContain('args(["/PID", process_id.as_str(), "/T", "/F"])');
    expect(sandbox).toContain("kill(-process_group, SIGKILL)");
    expect(sandbox).toContain("MAX_WORKSPACE_BYTES: u64 = 16 * 1024 * 1024");
    expect(sandbox).toContain("MAX_WORKSPACE_FILES: usize = 512");
    expect(runtime).toContain("WORKSPACE_LIMIT_EXCEEDED");
    expect(projectRuntime).toContain("WORKSPACE_LIMIT_EXCEEDED");
    expect(runtime).toContain("bütün süreç ağacı durduruldu");
    expect(projectRuntime).toContain("bütün süreç ağacı durduruldu");
  });

  it("publishes the enforced security profile through diagnostics", () => {
    expect(protocol).toContain("export interface RuntimeSecurityProfile");
    expect(protocol).toContain('filesystemScope: "workspace-only"');
    expect(protocol).toContain('networkAccess: "blocked"');
    expect(protocol).toContain('subprocessAccess: "blocked"');
    expect(protocol).toContain("processTreeTermination: boolean");
    expect(diagnostics).toContain("Güvenli çalışma profili");
    expect(diagnostics).toContain("Süreç ağacı sonlandırma");
    expect(settings).toContain("Güvenlik sözleşmesi");
  });

  it("documents the threat model without claiming OS-level isolation", () => {
    expect(readme).toContain("39 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı");
    expect(readme).toContain("genel amaçlı, düşmanca kod barındırma servisi");
    expect(readme).toContain("docs/RUNTIME_SECURITY.md");
    expect(checklist).toContain("Güvenli çalışma motoru denemeleri");
    expect(checklist).toContain("socket.socket()");
    expect(checklist).toContain("çocuk süreç bırakmaz");
  });
});
