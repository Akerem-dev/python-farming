import { readFile, writeFile } from "node:fs/promises";

async function read(path) {
  return readFile(path, "utf8");
}

async function write(path, content) {
  await writeFile(path, content, "utf8");
}

function replaceExact(content, before, after, label) {
  if (!content.includes(before)) {
    throw new Error(`Patch hedefi bulunamadı: ${label}`);
  }
  return content.replace(before, after);
}

async function patchRuntime() {
  const path = "src-tauri/src/commands/runtime.rs";
  let value = await read(path);
  value = replaceExact(
    value,
    "use serde::{Deserialize, Serialize};\n",
    "use serde::{Deserialize, Serialize};\n\nuse super::python_interpreter::{find_python_interpreter, PythonInterpreterSource};\n",
    "runtime import",
  );
  value = replaceExact(
    value,
    `#[derive(Clone, Debug)]\nstruct PythonInterpreter {\n    executable: String,\n    prefix_args: Vec<String>,\n    version: String,\n}\n\n`,
    "",
    "runtime duplicate interpreter",
  );
  value = replaceExact(
    value,
    `pub struct RuntimeHealthResult {\n    status: String,\n    version: Option<String>,\n    executable: Option<String>,\n    message: String,\n}`,
    `pub struct RuntimeHealthResult {\n    status: String,\n    version: Option<String>,\n    executable: Option<String>,\n    source: Option<String>,\n    managed: bool,\n    message: String,\n}`,
    "runtime health fields",
  );
  value = replaceExact(
    value,
    `pub async fn runtime_health_check(\n    request_id: String,\n) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || runtime_health_check_sync(request_id))`,
    `pub async fn runtime_health_check(\n    app: tauri::AppHandle,\n    request_id: String,\n) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || runtime_health_check_sync(&app, request_id))`,
    "runtime health app handle",
  );
  value = replaceExact(
    value,
    `pub async fn execute_python(\n    request: ExecutePythonRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || execute_python_sync(request))`,
    `pub async fn execute_python(\n    app: tauri::AppHandle,\n    request: ExecutePythonRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || execute_python_sync(&app, request))`,
    "runtime execute app handle",
  );
  value = replaceExact(
    value,
    `fn runtime_health_check_sync(\n    request_id: String,\n) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {\n    match find_python_interpreter() {\n        Some(interpreter) => Ok(RuntimeResponse {`,
    `fn runtime_health_check_sync(\n    app: &tauri::AppHandle,\n    request_id: String,\n) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {\n    match find_python_interpreter(app) {\n        Some(interpreter) => {\n            let message = match interpreter.source {\n                PythonInterpreterSource::Bundled =>\n                    "Uygulamaya gömülü Python çalışma motoru kullanıma hazır.",\n                PythonInterpreterSource::Custom =>\n                    "PYTHON_FARMING_PYTHON ile seçilen yorumlayıcı kullanıma hazır.",\n                PythonInterpreterSource::System =>\n                    "Sistemde bulunan Python yorumlayıcısı kullanıma hazır.",\n            };\n            Ok(RuntimeResponse {`,
    "runtime health sync",
  );
  value = replaceExact(
    value,
    `                version: Some(interpreter.version),\n                executable: Some(interpreter.executable),\n                message: "Yerel Python yorumlayıcısı kullanıma hazır.".to_string(),\n            }),\n            diagnostics: Vec::new(),\n        }),\n        None => Ok(RuntimeResponse {`,
    `                version: Some(interpreter.version),\n                executable: Some(interpreter.executable.to_string_lossy().to_string()),\n                source: Some(interpreter.source.as_str().to_string()),\n                managed: interpreter.source.is_managed(),\n                message: message.to_string(),\n            }),\n            diagnostics: Vec::new(),\n        })\n        }\n        None => Ok(RuntimeResponse {`,
    "runtime ready payload",
  );
  value = replaceExact(
    value,
    `                version: None,\n                executable: None,\n                message: "Python 3 bulunamadı. Geliştirme sürümünde kod çalıştırmak için Python 3 kurulmalıdır."\n                    .to_string(),`,
    `                version: None,\n                executable: None,\n                source: None,\n                managed: false,\n                message: "Bu build içinde gömülü Python bulunamadı ve sistem Python 3 yorumlayıcısı da kullanılamıyor."\n                    .to_string(),`,
    "runtime offline payload",
  );
  value = replaceExact(
    value,
    `fn execute_python_sync(\n    request: ExecutePythonRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    validate_request(&request)?;\n\n    let interpreter = find_python_interpreter()`,
    `fn execute_python_sync(\n    app: &tauri::AppHandle,\n    request: ExecutePythonRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    validate_request(&request)?;\n\n    let interpreter = find_python_interpreter(app)`,
    "runtime execute sync",
  );
  const start = value.indexOf("fn find_python_interpreter() -> Option<PythonInterpreter> {");
  const end = value.indexOf("fn create_workspace(request_id: &str)", start);
  if (start < 0 || end < 0) {
    throw new Error("Patch hedefi bulunamadı: runtime duplicate resolver block");
  }
  value = `${value.slice(0, start)}${value.slice(end)}`;
  await write(path, value);
}

async function patchProjectRuntime() {
  const path = "src-tauri/src/commands/project_runtime.rs";
  let value = await read(path);
  value = replaceExact(
    value,
    "use serde::{Deserialize, Serialize};\n",
    "use serde::{Deserialize, Serialize};\n\nuse super::python_interpreter::find_python_interpreter;\n",
    "project runtime import",
  );
  value = replaceExact(
    value,
    `#[derive(Clone, Debug)]\nstruct PythonInterpreter {\n    executable: String,\n    prefix_args: Vec<String>,\n}\n\n`,
    "",
    "project duplicate interpreter",
  );
  value = replaceExact(
    value,
    `pub async fn execute_python_project(\n    request: ExecutePythonProjectRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || execute_python_project_sync(request))`,
    `pub async fn execute_python_project(\n    app: tauri::AppHandle,\n    request: ExecutePythonProjectRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    tauri::async_runtime::spawn_blocking(move || execute_python_project_sync(&app, request))`,
    "project runtime app handle",
  );
  value = replaceExact(
    value,
    `fn execute_python_project_sync(\n    request: ExecutePythonProjectRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    let validated_files = validate_request(&request)?;\n    let interpreter = find_python_interpreter()`,
    `fn execute_python_project_sync(\n    app: &tauri::AppHandle,\n    request: ExecutePythonProjectRequest,\n) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {\n    let validated_files = validate_request(&request)?;\n    let interpreter = find_python_interpreter(app)`,
    "project runtime sync",
  );
  const start = value.indexOf("fn find_python_interpreter() -> Option<PythonInterpreter> {");
  const end = value.indexOf("fn create_workspace(request_id: &str)", start);
  if (start < 0 || end < 0) {
    throw new Error("Patch hedefi bulunamadı: project duplicate resolver block");
  }
  value = `${value.slice(0, start)}${value.slice(end)}`;
  await write(path, value);
}

async function patchJsonFiles() {
  const packagePath = "package.json";
  const packageJson = JSON.parse(await read(packagePath));
  packageJson.scripts["prepare:runtime"] = "node scripts/prepare-portable-python.mjs";
  await write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const tauriPath = "src-tauri/tauri.conf.json";
  const tauri = JSON.parse(await read(tauriPath));
  tauri.build.beforeBuildCommand = "npm run prepare:runtime && npm run build";
  tauri.bundle.resources = ["python-runtime/**/*"];
  await write(tauriPath, `${JSON.stringify(tauri, null, 2)}\n`);
}

async function patchFrontend() {
  const protocolPath = "src/runtime/runtimeProtocol.ts";
  let protocol = await read(protocolPath);
  protocol = replaceExact(
    protocol,
    `export interface RuntimeHealthResult {\n  status: "ready" | "offline";\n  version?: string;\n  executable?: string;\n  message: string;\n}`,
    `export type RuntimeInterpreterSource = "bundled" | "custom" | "system";\n\nexport interface RuntimeHealthResult {\n  status: "ready" | "offline";\n  version?: string;\n  executable?: string;\n  source?: RuntimeInterpreterSource;\n  managed?: boolean;\n  message: string;\n}`,
    "runtime protocol source",
  );
  await write(protocolPath, protocol);

  const diagnosticsPath = "src/features/diagnostics/services/diagnosticsService.ts";
  let diagnostics = await read(diagnosticsPath);
  diagnostics = replaceExact(
    diagnostics,
    `    \`Python executable: \${snapshot.runtime?.executable ?? "bulunamadı"}\`,\n    \`Python mesajı: \${snapshot.runtime?.message ?? "yanıt yok"}\`,`,
    `    \`Python executable: \${snapshot.runtime?.executable ?? "bulunamadı"}\`,\n    \`Python kaynağı: \${snapshot.runtime?.source ?? "bulunamadı"}\`,\n    \`Python uygulama tarafından yönetiliyor: \${snapshot.runtime?.managed ? "evet" : "hayır"}\`,\n    \`Python mesajı: \${snapshot.runtime?.message ?? "yanıt yok"}\`,`,
    "diagnostics runtime source",
  );
  await write(diagnosticsPath, diagnostics);

  const settingsPath = "src/pages/SettingsPage/SettingsPage.tsx";
  let settings = await read(settingsPath);
  settings = replaceExact(
    settings,
    `function formatCheckedAt(value: string | undefined) {\n  if (!value) {\n    return "Henüz kontrol edilmedi";\n  }\n\n  return new Intl.DateTimeFormat("tr-TR", {\n    dateStyle: "medium",\n    timeStyle: "medium",\n  }).format(new Date(value));\n}\n`,
    `function formatCheckedAt(value: string | undefined) {\n  if (!value) {\n    return "Henüz kontrol edilmedi";\n  }\n\n  return new Intl.DateTimeFormat("tr-TR", {\n    dateStyle: "medium",\n    timeStyle: "medium",\n  }).format(new Date(value));\n}\n\nfunction runtimeSourceLabel(source: "bundled" | "custom" | "system" | undefined) {\n  if (source === "bundled") return "Uygulamaya gömülü";\n  if (source === "custom") return "Geliştirici override";\n  if (source === "system") return "Sistem Python'ı";\n  return "—";\n}\n`,
    "settings source helper",
  );
  settings = replaceExact(
    settings,
    `              Bu ekran kullanıcı kodunu çalıştırmadan yerel Python yorumlayıcısını,\n              uygulama sürümünü, güvenlik limitlerini ve ilerleme kaydını inceler.`,
    `              Bu ekran kullanıcı kodunu çalıştırmadan gömülü veya sistem Python yorumlayıcısını,\n              uygulama sürümünü, güvenlik limitlerini ve ilerleme kaydını inceler.`,
    "settings hero",
  );
  settings = replaceExact(
    settings,
    `              <div>\n                <dt>Executable</dt>\n                <dd><code>{snapshot?.runtime?.executable ?? "—"}</code></dd>\n              </div>\n              <div>\n                <dt>Son kontrol</dt>`,
    `              <div>\n                <dt>Executable</dt>\n                <dd><code>{snapshot?.runtime?.executable ?? "—"}</code></dd>\n              </div>\n              <div>\n                <dt>Kaynak</dt>\n                <dd>{runtimeSourceLabel(snapshot?.runtime?.source)}</dd>\n              </div>\n              <div>\n                <dt>Son kontrol</dt>`,
    "settings source detail",
  );
  settings = replaceExact(
    settings,
    `                  Windows'ta <code>py -3 --version</code>, macOS/Linux'ta\n                  <code> python3 --version</code> komutunu kontrol et. Özel yorumlayıcı için\n                  <code> PYTHON_FARMING_PYTHON</code> ortam değişkeni kullanılabilir.`,
    `                  Production installer gömülü Python içermelidir. Geliştirme build'inde\n                  Windows'ta <code>py -3 --version</code>, macOS/Linux'ta\n                  <code> python3 --version</code> kontrol edilebilir; özel yorumlayıcı için\n                  <code> PYTHON_FARMING_PYTHON</code> kullanılabilir.`,
    "settings offline help",
  );
  await write(settingsPath, settings);
}

async function patchWorkflows() {
  const releasePath = ".github/workflows/release.yml";
  let release = await read(releasePath);
  release = replaceExact(release, "            rustTargets: aarch64-apple-darwin,x86_64-apple-darwin\n          - platform: macos-latest\n            label: macOS Intel", "            rustTargets: aarch64-apple-darwin,x86_64-apple-darwin\n            runtimeTarget: aarch64-apple-darwin\n          - platform: macos-latest\n            label: macOS Intel", "release arm runtime target");
  release = replaceExact(release, "            rustTargets: aarch64-apple-darwin,x86_64-apple-darwin\n          - platform: ubuntu-22.04", "            rustTargets: aarch64-apple-darwin,x86_64-apple-darwin\n            runtimeTarget: x86_64-apple-darwin\n          - platform: ubuntu-22.04", "release intel runtime target");
  release = replaceExact(release, "            rustTargets: \"\"\n          - platform: windows-latest", "            rustTargets: \"\"\n            runtimeTarget: x86_64-unknown-linux-gnu\n          - platform: windows-latest", "release linux runtime target");
  release = replaceExact(release, "            label: Windows x64\n            args: \"\"\n            rustTargets: \"\"", "            label: Windows x64\n            args: \"\"\n            rustTargets: \"\"\n            runtimeTarget: x86_64-pc-windows-msvc", "release windows runtime target");
  release = replaceExact(
    release,
    `        env:\n          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}\n          APPLE_SIGNING_IDENTITY:`,
    `        env:\n          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}\n          PYTHON_FARMING_RUNTIME_TARGET: \${{ matrix.runtimeTarget }}\n          APPLE_SIGNING_IDENTITY:`,
    "release runtime env",
  );
  await write(releasePath, release);

  const ciPath = ".github/workflows/ci.yml";
  let ci = await read(ciPath);
  ci = replaceExact(
    ci,
    `      - name: Build Debian bundle\n        run: npm run tauri:build -- --bundles deb`,
    `      - name: Build Debian bundle with portable Python\n        env:\n          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}\n          PYTHON_FARMING_RUNTIME_TARGET: x86_64-unknown-linux-gnu\n        run: npm run tauri:build -- --bundles deb`,
    "ci portable bundle",
  );
  ci = replaceExact(
    ci,
    `          test -s "\${bundles[0]}"\n          echo "Verified bundle: \${bundles[0]}"`,
    `          test -s "\${bundles[0]}"\n          extract_dir="\${RUNNER_TEMP}/python-farming-deb"\n          rm -rf "$extract_dir"\n          mkdir -p "$extract_dir"\n          dpkg-deb -x "\${bundles[0]}" "$extract_dir"\n          runtime="$(find "$extract_dir" -type f -path '*/python-runtime/python/install/bin/python3' -print -quit)"\n          manifest="$(find "$extract_dir" -type f -path '*/python-runtime/runtime-manifest.json' -print -quit)"\n          test -n "$runtime"\n          test -x "$runtime"\n          test -s "$manifest"\n          "$runtime" -I -X utf8 -c "import asyncio, json, sqlite3; print('portable-runtime-ok')"\n          echo "Verified bundle and portable runtime: \${bundles[0]}"`,
    "ci runtime smoke",
  );
  await write(ciPath, ci);
}

async function patchDocsAndTests() {
  const gitignorePath = ".gitignore";
  let gitignore = await read(gitignorePath);
  if (!gitignore.includes("src-tauri/python-runtime/")) {
    gitignore += "\n# Downloaded portable Python bundle\nsrc-tauri/python-runtime/\n";
  }
  await write(gitignorePath, gitignore);

  const readmePath = "README.md";
  let readme = await read(readmePath);
  readme = replaceExact(readme, "**37 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı.**", "**38 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı.**", "readme stage count");
  readme = replaceExact(readme, "- Yerel Python 3 yorumlayıcısını otomatik bulma", "- Installer'a gömülü, SHA-256 doğrulamalı taşınabilir Python 3 runtime'ı\n- Geliştirme için özel yorumlayıcı ve sistem Python fallback'i", "readme runtime feature");
  readme = replaceExact(readme, "- PATH üzerinde Python 3", "- Geliştirme modunda PATH üzerinde Python 3 veya `PYTHON_FARMING_PYTHON`; production installer'lar Python runtime'ını içerir", "readme requirement");
  readme = replaceExact(readme, "Python yorumlayıcısı şu sırayla aranır:", "Python yorumlayıcısı şu sırayla aranır:\n\n- `PYTHON_FARMING_PYTHON` geliştirici override'ı\n- Installer'a gömülü ve build sırasında SHA-256 doğrulanan runtime\n- Geliştirme fallback'i olarak sistem Python'ı\n\nSistem fallback adayları:", "readme search order");
  readme = replaceExact(readme, "Son kullanıcıya açık geniş dağıtım öncesinde gömülü ve imzalı Python runtime'ı, daha sıkı süreç izolasyonu, kod imzalama ve platform güvenlik kontrolleri ayrıca tamamlanmalıdır.", "Gömülü Python runtime installer'a dahil edilir ve build sırasında GitHub asset özetiyle doğrulanır. Daha sıkı süreç izolasyonu, kod imzalama, notarizasyon ve platform güvenlik kontrolleri sonraki sağlamlaştırma aşamalarında tamamlanacaktır.", "readme security");
  await write(readmePath, readme);

  const checklistPath = "docs/RELEASE_CHECKLIST.md";
  let checklist = await read(checklistPath);
  checklist = replaceExact(checklist, "- Uygulamanın ilk açılışı\n- Mevcut SQLite ilerlemesinin yüklenmesi", "- Uygulamanın Python kurulmamış temiz profilde ilk açılışı\n- Ayarlar ekranında Python kaynağının `Uygulamaya gömülü` görünmesi\n- Mevcut SQLite ilerlemesinin yüklenmesi", "checklist bundled runtime");
  checklist = replaceExact(checklist, "`src-tauri/target/release/bundle` altındaki installer açılmalı ve en az bir temiz kullanıcı profili üzerinde denenmelidir.", "`src-tauri/target/release/bundle` altındaki installer açılmalı ve Python kurulu olmayan en az bir temiz kullanıcı profili üzerinde denenmelidir. Tek dosya, çok dosya, `sqlite3`, `asyncio` ve JSON import smoke testleri gömülü runtime ile çalışmalıdır.", "checklist production runtime");
  checklist = replaceExact(checklist, "- dört platform çıktısı", "- dört platform çıktısı", "checklist noop");
  await write(checklistPath, checklist);

  const releaseTestPath = "src/test/content/releaseReadiness.test.ts";
  let releaseTest = await read(releaseTestPath);
  releaseTest = replaceExact(releaseTest, 'expect(readme).toContain("37 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı");', 'expect(readme).toContain("38 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı");', "release test stage count");
  await write(releaseTestPath, releaseTest);
}

await patchRuntime();
await patchProjectRuntime();
await patchJsonFiles();
await patchFrontend();
await patchWorkflows();
await patchDocsAndTests();
