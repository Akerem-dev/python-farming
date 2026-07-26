use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::{Command, ExitStatus, Stdio},
    thread,
    time::{Duration, Instant},
};

use super::{
    execution_sandbox::{
        configure_sandbox_command, create_secure_workspace, wait_for_sandboxed_child,
        write_workspace_file, PYTHON_SANDBOX_RUNNER,
    },
    python_interpreter::find_python_interpreter,
};

const PROTOCOL_VERSION: u8 = 1;
const MAX_PROJECT_BYTES: usize = 256 * 1024;
const MAX_STDIN_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const MAX_FILE_COUNT: usize = 64;
const MIN_TIMEOUT_MS: u64 = 250;
const MAX_TIMEOUT_MS: u64 = 10_000;
const ALLOWED_PROJECT_EXTENSIONS: [&str; 4] = ["py", "txt", "json", "csv"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSourceFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutePythonProjectRequest {
    pub request_id: String,
    pub files: Vec<ProjectSourceFile>,
    pub entrypoint: String,
    pub stdin: Vec<String>,
    pub timeout_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeResponse<T> {
    request_id: String,
    protocol_version: u8,
    status: String,
    payload: Option<T>,
    diagnostics: Vec<RuntimeDiagnostic>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDiagnostic {
    severity: String,
    code: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteCodeResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    duration_ms: u64,
    truncated: bool,
}

#[derive(Debug)]
struct CapturedOutput {
    text: String,
    truncated: bool,
}

#[tauri::command]
pub async fn execute_python_project(
    app: tauri::AppHandle,
    request: ExecutePythonProjectRequest,
) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {
    tauri::async_runtime::spawn_blocking(move || execute_python_project_sync(&app, request))
        .await
        .map_err(|error| format!("Python proje görevi tamamlanamadı: {error}"))?
}

fn execute_python_project_sync(
    app: &tauri::AppHandle,
    request: ExecutePythonProjectRequest,
) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {
    let validated_files = validate_request(&request)?;
    let interpreter = find_python_interpreter(app)
        .ok_or_else(|| "Python 3 yorumlayıcısı bulunamadı.".to_string())?;
    let timeout_ms = request.timeout_ms.clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    let started_at = Instant::now();
    let workspace = create_secure_workspace(&request.request_id)?;

    for (relative_path, content) in &validated_files {
        let target = workspace.join(relative_path);
        if let Err(error) = write_workspace_file(&target, content.as_bytes()) {
            let _ = fs::remove_dir_all(&workspace);
            return Err(error);
        }
    }

    let entrypoint = validate_relative_python_path(&request.entrypoint)?;
    let entrypoint_text = entrypoint
        .to_str()
        .ok_or_else(|| "Giriş dosyası yolu UTF-8 değil.".to_string())?;
    let workspace_text = workspace
        .to_str()
        .ok_or_else(|| "Güvenli proje yolu UTF-8 değil.".to_string())?;

    let mut command = Command::new(&interpreter.executable);
    command
        .args(&interpreter.prefix_args)
        .arg("-I")
        .arg("-X")
        .arg("utf8")
        .arg("-B")
        .arg("-c")
        .arg(PYTHON_SANDBOX_RUNNER)
        .arg(workspace_text)
        .arg(entrypoint_text)
        .current_dir(&workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Err(error) = configure_sandbox_command(&mut command, &workspace) {
        let _ = fs::remove_dir_all(&workspace);
        return Err(error);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let _ = fs::remove_dir_all(&workspace);
            return Err(format!("Python proje süreci başlatılamadı: {error}"));
        }
    };
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Python stdout kanalı açılamadı.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Python stderr kanalı açılamadı.".to_string())?;
    let stdout_reader = thread::spawn(move || capture_output(stdout, MAX_OUTPUT_BYTES));
    let stderr_reader = thread::spawn(move || capture_output(stderr, MAX_OUTPUT_BYTES));

    if let Some(mut stdin) = child.stdin.take() {
        let mut input = request.stdin.join("\n");
        if !input.is_empty() && !input.ends_with('\n') {
            input.push('\n');
        }
        if let Err(error) = stdin.write_all(input.as_bytes()) {
            let _ = fs::remove_dir_all(&workspace);
            return Err(format!("Python stdin verisi gönderilemedi: {error}"));
        }
    }

    let wait_result =
        wait_for_sandboxed_child(&mut child, &workspace, Duration::from_millis(timeout_ms));
    let stdout = stdout_reader.join().unwrap_or_else(|_| CapturedOutput {
        text: String::new(),
        truncated: false,
    });
    let stderr = stderr_reader.join().unwrap_or_else(|_| CapturedOutput {
        text: "Python stderr çıktısı okunamadı.".to_string(),
        truncated: false,
    });
    let _ = fs::remove_dir_all(&workspace);
    let outcome = wait_result?;

    let duration_ms = started_at.elapsed().as_millis().min(u64::MAX as u128) as u64;
    let truncated = stdout.truncated || stderr.truncated;
    let policy_violation = sandbox_policy_violation(&stderr.text);
    let status = if outcome.timed_out {
        "timeout"
    } else if outcome.workspace_limit_exceeded || policy_violation {
        "error"
    } else if outcome
        .exit_status
        .as_ref()
        .is_some_and(ExitStatus::success)
    {
        "ok"
    } else {
        "error"
    };

    let mut diagnostics = Vec::new();
    if outcome.timed_out {
        diagnostics.push(RuntimeDiagnostic {
            severity: "error".to_string(),
            code: "EXECUTION_TIMEOUT".to_string(),
            message: format!(
                "Proje {timeout_ms} ms içinde tamamlanmadığı için bütün süreç ağacı durduruldu."
            ),
        });
    }
    if outcome.workspace_limit_exceeded {
        diagnostics.push(RuntimeDiagnostic {
            severity: "error".to_string(),
            code: "WORKSPACE_LIMIT_EXCEEDED".to_string(),
            message: "Proje çalışma alanı dosya veya boyut sınırını aştığı için durduruldu."
                .to_string(),
        });
    }
    if policy_violation {
        diagnostics.push(RuntimeDiagnostic {
            severity: "error".to_string(),
            code: "SANDBOX_POLICY_VIOLATION".to_string(),
            message: "Proje güvenli çalışma alanı politikasının engellediği bir işlem denedi."
                .to_string(),
        });
    }
    if truncated {
        diagnostics.push(RuntimeDiagnostic {
            severity: "warning".to_string(),
            code: "OUTPUT_TRUNCATED".to_string(),
            message: "Terminal çıktısı güvenli boyut sınırını aştığı için kısaltıldı.".to_string(),
        });
    }

    Ok(RuntimeResponse {
        request_id: request.request_id,
        protocol_version: PROTOCOL_VERSION,
        status: status.to_string(),
        payload: Some(ExecuteCodeResult {
            stdout: stdout.text,
            stderr: stderr.text,
            exit_code: outcome.exit_status.and_then(|value| value.code()),
            duration_ms,
            truncated,
        }),
        diagnostics,
    })
}

fn validate_request(
    request: &ExecutePythonProjectRequest,
) -> Result<Vec<(PathBuf, String)>, String> {
    if request.files.is_empty() {
        return Err("Python projesinde en az bir dosya bulunmalıdır.".to_string());
    }
    if request.files.len() > MAX_FILE_COUNT {
        return Err(format!("Proje en fazla {MAX_FILE_COUNT} dosya içerebilir."));
    }

    let total_size = request
        .files
        .iter()
        .map(|file| file.content.len())
        .sum::<usize>();
    if total_size > MAX_PROJECT_BYTES {
        return Err(format!(
            "Proje dosyaları {} KB sınırını aşıyor.",
            MAX_PROJECT_BYTES / 1024
        ));
    }

    let stdin_size = request.stdin.iter().map(String::len).sum::<usize>();
    if stdin_size > MAX_STDIN_BYTES {
        return Err(format!(
            "Girdi verisi {} KB sınırını aşıyor.",
            MAX_STDIN_BYTES / 1024
        ));
    }

    let mut paths = HashSet::new();
    let mut validated = Vec::with_capacity(request.files.len());
    for file in &request.files {
        let path = validate_relative_project_path(&file.path)?;
        if !paths.insert(path.clone()) {
            return Err(format!("Projede tekrar eden dosya yolu var: {}", file.path));
        }
        validated.push((path, file.content.clone()));
    }

    let entrypoint = validate_relative_python_path(&request.entrypoint)?;
    if !paths.contains(&entrypoint) {
        return Err("Giriş dosyası proje dosyaları arasında bulunamadı.".to_string());
    }

    Ok(validated)
}

fn validate_relative_python_path(value: &str) -> Result<PathBuf, String> {
    let path = validate_relative_project_path(value)?;
    if path.extension().and_then(|extension| extension.to_str()) != Some("py") {
        return Err(format!("Giriş dosyası .py uzantılı olmalıdır: {value}"));
    }
    Ok(path)
}

fn validate_relative_project_path(value: &str) -> Result<PathBuf, String> {
    if value.trim().is_empty() || value.contains('\\') {
        return Err("Proje dosya yolu geçersiz.".to_string());
    }

    let path = Path::new(value);
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| format!("Dosya uzantısı bulunamadı: {value}"))?;
    if path.is_absolute() || !ALLOWED_PROJECT_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!(
            "Yalnız göreli .py, .txt, .json ve .csv dosyalarına izin verilir: {value}"
        ));
    }

    let mut safe_path = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let text = part
                    .to_str()
                    .ok_or_else(|| "Dosya yolu UTF-8 olmalıdır.".to_string())?;
                if text.is_empty()
                    || text.len() > 80
                    || !text.chars().all(|character| {
                        character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
                    })
                {
                    return Err(format!("Güvenli olmayan dosya yolu bileşeni: {text}"));
                }
                safe_path.push(text);
            }
            _ => return Err(format!("Üst klasöre çıkan dosya yolu reddedildi: {value}")),
        }
    }

    if safe_path.as_os_str().is_empty() {
        return Err("Proje dosya yolu boş olamaz.".to_string());
    }
    Ok(safe_path)
}

fn capture_output<R: Read>(mut reader: R, limit: usize) -> CapturedOutput {
    let mut output = Vec::new();
    let mut buffer = [0_u8; 4096];
    let mut truncated = false;

    loop {
        let Ok(read_count) = reader.read(&mut buffer) else {
            break;
        };
        if read_count == 0 {
            break;
        }

        let remaining = limit.saturating_sub(output.len());
        if remaining > 0 {
            output.extend_from_slice(&buffer[..read_count.min(remaining)]);
        }
        if read_count > remaining {
            truncated = true;
        }
    }

    CapturedOutput {
        text: String::from_utf8_lossy(&output).into_owned(),
        truncated,
    }
}

fn sandbox_policy_violation(stderr: &str) -> bool {
    stderr.contains("Çalışma alanı dışındaki dosyalar okunamaz")
        || stderr.contains("Çalışma alanı dışına dosya yazılamaz")
        || stderr.contains("çalışma alanında dış süreç oluşturma kapalıdır")
        || stderr.contains("çalışma alanında ağ erişimi kapalıdır")
        || stderr.contains("çalışma alanında yerel kütüphane yükleme kapalıdır")
        || stderr.contains("çalışma alanında sembolik bağlantı oluşturma kapalıdır")
}

#[cfg(test)]
mod tests {
    use super::{
        sandbox_policy_violation, validate_relative_project_path, validate_relative_python_path,
    };
    use std::path::PathBuf;

    #[test]
    fn package_paths_are_preserved() {
        assert_eq!(
            validate_relative_python_path("magaza/__init__.py").unwrap(),
            PathBuf::from("magaza/__init__.py")
        );
    }

    #[test]
    fn text_json_and_csv_files_are_allowed() {
        assert_eq!(
            validate_relative_project_path("data/urunler.json").unwrap(),
            PathBuf::from("data/urunler.json")
        );
        assert!(validate_relative_project_path("notlar.txt").is_ok());
        assert!(validate_relative_project_path("rapor.csv").is_ok());
    }

    #[test]
    fn parent_directory_paths_are_rejected() {
        assert!(validate_relative_project_path("../secret.json").is_err());
    }

    #[test]
    fn absolute_and_unsupported_paths_are_rejected() {
        assert!(validate_relative_project_path("/tmp/main.py").is_err());
        assert!(validate_relative_project_path("program.exe").is_err());
    }

    #[test]
    fn entrypoint_must_be_python() {
        assert!(validate_relative_python_path("data.json").is_err());
    }

    #[test]
    fn detects_known_sandbox_policy_messages() {
        assert!(sandbox_policy_violation(
            "PermissionError: Çalışma alanı dışındaki dosyalar okunamaz."
        ));
        assert!(!sandbox_policy_violation(
            "PermissionError: kullanıcı hatası"
        ));
    }
}
