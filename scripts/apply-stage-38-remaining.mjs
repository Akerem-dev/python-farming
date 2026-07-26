import { readFile, writeFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, content) => writeFile(path, content, "utf8");

function replaceExact(content, before, after, label) {
  if (!content.includes(before)) throw new Error(`Patch hedefi bulunamadı: ${label}`);
  return content.replace(before, after);
}

async function patchRuntime() {
  const path = "src-tauri/src/commands/runtime.rs";
  let value = await read(path);
  value = replaceExact(value, "use serde::{Deserialize, Serialize};\n", "use serde::{Deserialize, Serialize};\n\nuse super::python_interpreter::{find_python_interpreter, PythonInterpreterSource};\n", "runtime import");
  value = replaceExact(value, `#[derive(Clone, Debug)]\nstruct PythonInterpreter {\n    executable: String,\n    prefix_args: Vec<String>,\n    version: String,\n}\n\n`, "", "runtime duplicate interpreter");
  value = replaceExact(value, `pub struct RuntimeHealthResult {\n    status: String,\n    version: Option<String>,\n    executable: Option<String>,\n    message: String,\n}`, `pub struct RuntimeHealthResult {\n    status: String,\n    version: Option<String>,\n    executable: Option<String>,\n    source: Option<String>,\n    managed: bool,\n    message: String,\n}`, "runtime health fields");
  value = replaceExact(value, `pub async fn runtime_health_check(\n    request_id: String,\n) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || runtime_health_check_sync(request_id))`, `pub async fn runtime_health_check(\n    app: tauri::AppHandle,\n    request_id: String,\n) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || runtime_health_check_sync(&app, request_id))`, "runtime health app");
  value = replaceExact(value, `pub async fn execute_python(\n    request: ExecutePythonRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || execute_python_sync(request))`, `pub async fn execute_python(\n    app: tauri::AppHandle,\n    request: ExecutePythonRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || execute_python_sync(&app, request))`, "runtime execute app");
  value = replaceExact(value, `fn runtime_health_check_sync(\n    request_id: String,\n) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {\n    match find_python_interpreter() {\n        Some(interpreter) => Ok(RuntimeResponse {`, `fn runtime_health_check_sync(\n    app: &tauri::AppHandle,\n    request_id: String,\n) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {\n    match find_python_interpreter(app) {\n        Some(interpreter) => {\n            let message = match interpreter.source {\n                PythonInterpreterSource::Bundled => "Uygulamaya gömülü Python çalışma motoru kullanıma hazır.",\n                PythonInterpreterSource::Custom => "PYTHON_FARMING_PYTHON ile seçilen yorumlayıcı kullanıma hazır.",\n                PythonInterpreterSource::System => "Sistemde bulunan Python yorumlayıcısı kullanıma hazır.",\n            };\n            Ok(RuntimeResponse {`, "runtime health sync");
  value = replaceExact(value, `                version: Some(interpreter.version),\n                executable: Some(interpreter.executable),\n                message: "Yerel Python yorumlayıcısı kullanıma hazır.".to_string(),\n            }),\n            diagnostics: Vec::new(),\n        }),\n        None => Ok(RuntimeResponse {`, `                version: Some(interpreter.version),\n                executable: Some(interpreter.executable.to_string_lossy().to_string()),\n                source: Some(interpreter.source.as_str().to_string()),\n                managed: interpreter.source.is_managed(),\n                message: message.to_string(),\n            }),\n            diagnostics: Vec::new(),\n        })\n        }\n        None => Ok(RuntimeResponse {`, "runtime ready payload");
  value = replaceExact(value, `                version: None,\n                executable: None,\n                message: "Python 3 bulunamadı. Geliştirme sürümünde kod çalıştırmak için Python 3 kurulmalıdır."\n                    .to_string(),`, `                version: None,\n                executable: None,\n                source: None,\n                managed: false,\n                message: "Bu build içinde gömülü Python bulunamadı ve sistem Python 3 yorumlayıcısı da kullanılamıyor."\n                    .to_string(),`, "runtime offline payload");
  value = replaceExact(value, `fn execute_python_sync(\n    request: ExecutePythonRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    validate_request(&request)?;\n\n    let interpreter = find_python_interpreter()`, `fn execute_python_sync(\n    app: &tauri::AppHandle,\n    request: ExecutePythonRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    validate_request(&request)?;\n\n    let interpreter = find_python_interpreter(app)`, "runtime execute sync");
  const start = value.indexOf("fn find_python_interpreter() -> Option<PythonInterpreter> {");
  const end = value.indexOf("fn create_workspace(request_id: &str)", start);
  if (start < 0 || end < 0) throw new Error("runtime resolver block bulunamadı");
  value = `${value.slice(0, start)}${value.slice(end)}`;
  await write(path, value);
}

async function patchProjectRuntime() {
  const path = "src-tauri/src/commands/project_runtime.rs";
  let value = await read(path);
  value = replaceExact(value, "use serde::{Deserialize, Serialize};\n", "use serde::{Deserialize, Serialize};\n\nuse super::python_interpreter::find_python_interpreter;\n", "project import");
  value = replaceExact(value, `#[derive(Clone, Debug)]\nstruct PythonInterpreter {\n    executable: String,\n    prefix_args: Vec<String>,\n}\n\n`, "", "project duplicate interpreter");
  value = replaceExact(value, `pub async fn execute_python_project(\n    request: ExecutePythonProjectRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || execute_python_project_sync(request))`, `pub async fn execute_python_project(\n    app: tauri::AppHandle,\n    request: ExecutePythonProjectRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || execute_python_project_sync(&app, request))`, "project app");
  value = replaceExact(value, `fn execute_python_project_sync(\n    request: ExecutePythonProjectRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    let validated_files = validate_request(&request)?;\n    let interpreter = find_python_interpreter()`, `fn execute_python_project_sync(\n    app: &tauri::AppHandle,\n    request: ExecutePythonProjectRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    let validated_files = validate_request(&request)?;\n    let interpreter = find_python_interpreter(app)`, "project sync");
  const start = value.indexOf("fn find_python_interpreter() -> Option<PythonInterpreter> {");
  const end = value.indexOf("fn create_workspace(request_id: &str)", start);
  if (start < 0 || end < 0) throw new Error("project resolver block bulunamadı");
  value = `${value.slice(0, start)}${value.slice(end)}`;
  await write(path, value);
}

async function patchSettings() {
  const path = "src/pages/SettingsPage/SettingsPage.tsx";
  let value = await read(path);
  value = replaceExact(value, `function formatCheckedAt(value: string | undefined) {\n  if (!value) {\n    return "Henüz kontrol edilmedi";\n  }\n\n  return new Intl.DateTimeFormat("tr-TR", {\n    dateStyle: "medium",\n    timeStyle: "medium",\n  }).format(new Date(value));\n}\n`, `function formatCheckedAt(value: string | undefined) {\n  if (!value) {\n    return "Henüz kontrol edilmedi";\n  }\n\n  return new Intl.DateTimeFormat("tr-TR", {\n    dateStyle: "medium",\n    timeStyle: "medium",\n  }).format(new Date(value));\n}\n\nfunction runtimeSourceLabel(source: "bundled" | "custom" | "system" | undefined) {\n  if (source === "bundled") return "Uygulamaya gömülü";\n  if (source === "custom") return "Geliştirici override";\n  if (source === "system") return "Sistem Python'ı";\n  return "—";\n}\n`, "settings helper");
  value = replaceExact(value, "Bu ekran kullanıcı kodunu çalıştırmadan yerel Python yorumlayıcısını,", "Bu ekran kullanıcı kodunu çalıştırmadan gömülü veya sistem Python yorumlayıcısını,", "settings hero");
  value = replaceExact(value, `              <div>\n                <dt>Executable</dt>\n                <dd><code>{snapshot?.runtime?.executable ?? "—"}</code></dd>\n              </div>\n              <div>\n                <dt>Son kontrol</dt>`, `              <div>\n                <dt>Executable</dt>\n                <dd><code>{snapshot?.runtime?.executable ?? "—"}</code></dd>\n              </div>\n              <div>\n                <dt>Kaynak</dt>\n                <dd>{runtimeSourceLabel(snapshot?.runtime?.source)}</dd>\n              </div>\n              <div>\n                <dt>Son kontrol</dt>`, "settings source");
  value = replaceExact(value, `                  Windows'ta <code>py -3 --version</code>, macOS/Linux'ta\n                  <code> python3 --version</code> komutunu kontrol et. Özel yorumlayıcı için\n                  <code> PYTHON_FARMING_PYTHON</code> ortam değişkeni kullanılabilir.`, `                  Production installer gömülü Python içermelidir. Geliştirme build'inde\n                  Windows'ta <code>py -3 --version</code>, macOS/Linux'ta\n                  <code> python3 --version</code> kontrol edilebilir; özel yorumlayıcı için\n                  <code> PYTHON_FARMING_PYTHON</code> kullanılabilir.`, "settings help");
  await write(path, value);
}

async function patchWorkflows() {
  const releasePath = ".github/workflows/release.yml";
  let release = await read(releasePath);
  release = replaceExact(release, "            rustTargets: aarch64-apple-darwin,x86_64-apple-darwin\n          - platform: macos-latest\n            label: macOS Intel", "            rustTargets: aarch64-apple-darwin,x86_64-apple-darwin\n            runtimeTarget: aarch64-apple-darwin\n          - platform: macos-latest\n            label: macOS Intel", "release arm");
  release = replaceExact(release, "            rustTargets: aarch64-apple-darwin,x86_64-apple-darwin\n          - platform: ubuntu-22.04", "            rustTargets: aarch64-apple-darwin,x86_64-apple-darwin\n            runtimeTarget: x86_64-apple-darwin\n          - platform: ubuntu-22.04", "release intel");
  release = replaceExact(release, "            rustTargets: \"\"\n          - platform: windows-latest", "            rustTargets: \"\"\n            runtimeTarget: x86_64-unknown-linux-gnu\n          - platform: windows-latest", "release linux");
  release = replaceExact(release, "            label: Windows x64\n            args: \"\"\n            rustTargets: \"\"", "            label: Windows x64\n            args: \"\"\n            rustTargets: \"\"\n            runtimeTarget: x86_64-pc-windows-msvc", "release windows");
  release = replaceExact(release, `        env:\n          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}\n          APPLE_SIGNING_IDENTITY:`, `        env:\n          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}\n          PYTHON_FARMING_RUNTIME_TARGET: \${{ matrix.runtimeTarget }}\n          APPLE_SIGNING_IDENTITY:`, "release env");
  await write(releasePath, release);

  const ciPath = ".github/workflows/ci.yml";
  let ci = await read(ciPath);
  ci = replaceExact(ci, `      - name: Build Debian bundle\n        run: npm run tauri:build -- --bundles deb`, `      - name: Build Debian bundle with portable Python\n        env:\n          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}\n          PYTHON_FARMING_RUNTIME_TARGET: x86_64-unknown-linux-gnu\n        run: npm run tauri:build -- --bundles deb`, "ci build");
  ci = replaceExact(ci, `          test -s "\${bundles[0]}"\n          echo "Verified bundle: \${bundles[0]}"`, `          test -s "\${bundles[0]}"\n          extract_dir="\${RUNNER_TEMP}/python-farming-deb"\n          rm -rf "$extract_dir"\n          mkdir -p "$extract_dir"\n          dpkg-deb -x "\${bundles[0]}" "$extract_dir"\n          runtime="$(find "$extract_dir" -type f -path '*/python-runtime/python/install/bin/python3' -print -quit)"\n          manifest="$(find "$extract_dir" -type f -path '*/python-runtime/runtime-manifest.json' -print -quit)"\n          test -n "$runtime"\n          test -x "$runtime"\n          test -s "$manifest"\n          "$runtime" -I -X utf8 -c "import asyncio, json, sqlite3; print('portable-runtime-ok')"\n          echo "Verified bundle and portable runtime: \${bundles[0]}"`, "ci smoke");
  const markerStart = "  # STAGE38_APPLY_START\n";
  const markerEnd = "  # STAGE38_APPLY_END\n";
  const start = ci.indexOf(markerStart);
  const end = ci.indexOf(markerEnd, start);
  if (start >= 0 && end >= 0) ci = `${ci.slice(0, start)}${ci.slice(end + markerEnd.length)}`;
  await write(ciPath, ci);
}

async function patchDocs() {
  const gitignorePath = ".gitignore";
  let gitignore = await read(gitignorePath);
  if (!gitignore.includes("src-tauri/python-runtime/")) gitignore += "\n# Downloaded portable Python bundle\nsrc-tauri/python-runtime/\n";
  await write(gitignorePath, gitignore);

  const readmePath = "README.md";
  let readme = await read(readmePath);
  readme = replaceExact(readme, "**37 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı.**", "**38 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı.**", "readme stage");
  readme = replaceExact(readme, "- Yerel Python 3 yorumlayıcısını otomatik bulma", "- Installer'a gömülü, SHA-256 doğrulamalı taşınabilir Python 3 runtime'ı\n- Geliştirme için özel yorumlayıcı ve sistem Python fallback'i", "readme feature");
  readme = replaceExact(readme, "- PATH üzerinde Python 3", "- Geliştirme modunda PATH üzerinde Python 3 veya `PYTHON_FARMING_PYTHON`; production installer'lar Python runtime'ını içerir", "readme requirement");
  readme = replaceExact(readme, "Python yorumlayıcısı şu sırayla aranır:", "Python yorumlayıcısı şu sırayla aranır:\n\n- `PYTHON_FARMING_PYTHON` geliştirici override'ı\n- Installer'a gömülü ve build sırasında SHA-256 doğrulanan runtime\n- Geliştirme fallback'i olarak sistem Python'ı\n\nSistem fallback adayları:", "readme order");
  readme = replaceExact(readme, "Son kullanıcıya açık geniş dağıtım öncesinde gömülü ve imzalı Python runtime'ı, daha sıkı süreç izolasyonu, kod imzalama ve platform güvenlik kontrolleri ayrıca tamamlanmalıdır.", "Gömülü Python runtime installer'a dahil edilir ve build sırasında GitHub asset özetiyle doğrulanır. Daha sıkı süreç izolasyonu, kod imzalama, notarizasyon ve platform güvenlik kontrolleri sonraki sağlamlaştırma aşamalarında tamamlanacaktır.", "readme security");
  await write(readmePath, readme);

  const checklistPath = "docs/RELEASE_CHECKLIST.md";
  let checklist = await read(checklistPath);
  checklist = replaceExact(checklist, "- Uygulamanın ilk açılışı\n- Mevcut SQLite ilerlemesinin yüklenmesi", "- Uygulamanın Python kurulmamış temiz profilde ilk açılışı\n- Ayarlar ekranında Python kaynağının `Uygulamaya gömülü` görünmesi\n- Mevcut SQLite ilerlemesinin yüklenmesi", "checklist smoke");
  checklist = replaceExact(checklist, "`src-tauri/target/release/bundle` altındaki installer açılmalı ve en az bir temiz kullanıcı profili üzerinde denenmelidir.", "`src-tauri/target/release/bundle` altındaki installer açılmalı ve Python kurulu olmayan en az bir temiz kullanıcı profili üzerinde denenmelidir. Tek dosya, çok dosya, `sqlite3`, `asyncio` ve JSON import smoke testleri gömülü runtime ile çalışmalıdır.", "checklist build");
  await write(checklistPath, checklist);

  const releaseTestPath = "src/test/content/releaseReadiness.test.ts";
  let releaseTest = await read(releaseTestPath);
  releaseTest = replaceExact(releaseTest, 'expect(readme).toContain("37 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı");', 'expect(readme).toContain("38 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı");', "release test");
  await write(releaseTestPath, releaseTest);
}

await patchRuntime();
await patchProjectRuntime();
await patchSettings();
await patchWorkflows();
await patchDocs();
