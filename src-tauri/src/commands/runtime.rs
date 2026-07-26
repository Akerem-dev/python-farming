use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    process::{Command, ExitStatus, Stdio},
    thread,
    time::{Duration, Instant},
};

use super::{
    execution_sandbox::{
        configure_sandbox_command, create_secure_workspace, security_profile,
        wait_for_sandboxed_child, write_workspace_file, RuntimeSecurityProfile,
        PYTHON_SANDBOX_RUNNER,
    },
    python_interpreter::{find_python_interpreter, PythonInterpreterSource},
};

const PROTOCOL_VERSION: u8 = 1;
const MAX_SOURCE_BYTES: usize = 128 * 1024;
const MAX_STDIN_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const MIN_TIMEOUT_MS: u64 = 250;
const MAX_TIMEOUT_MS: u64 = 10_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutePythonRequest {
    pub request_id: String,
    pub source: String,
    pub filename: String,
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
pub struct RuntimeHealthResult {
    status: String,
    version: Option<String>,
    executable: Option<String>,
    source: Option<String>,
    managed: bool,
    security: RuntimeSecurityProfile,
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
pub async fn runtime_health_check(
    app: tauri::AppHandle,
    request_id: String,
) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {
    tauri::async_runtime::spawn_blocking(move || runtime_health_check_sync(&app, request_id))
        .await
        .map_err(|error| format!("Runtime sağlık kontrolü tamamlanamadı: {error}"))?
}

#[tauri::command]
pub async fn execute_python(
    app: tauri::AppHandle,
    request: ExecutePythonRequest,
) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {
    tauri::async_runtime::spawn_blocking(move || execute_python_sync(&app, request))
        .await
        .map_err(|error| format!("Python çalışma görevi tamamlanamadı: {error}"))?
}

fn runtime_health_check_sync(
    app: &tauri::AppHandle,
    request_id: String,
) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {
    let security = security_profile();
    match find_python_interpreter(app) {
        Some(interpreter) => {
            let message = match interpreter.source {
                PythonInterpreterSource::Bundled => {
                    "Uygulamaya gömülü Python çalışma motoru güvenli çalışma profiliyle hazır."
                }
                PythonInterpreterSource::Custom => {
                    "PYTHON_FARMING_PYTHON ile seçilen yorumlayıcı güvenli çalışma profiliyle hazır."
                }
                PythonInterpreterSource::System => {
                    "Sistemde bulunan Python yorumlayıcısı güvenli çalışma profiliyle hazır."
                }
            };
            Ok(RuntimeResponse {
                request_id,
                protocol_version: PROTOCOL_VERSION,
                status: "ok".to_string(),
                payload: Some(RuntimeHealthResult {
                    status: "ready".to_string(),
                    version: Some(interpreter.version),
                    executable: Some(interpreter.executable.to_string_lossy().to_string()),
                    source: Some(interpreter.source.as_str().to_string()),
                    managed: interpreter.source.is_managed(),
                    security,
                    message: message.to_string(),
                }),
                diagnostics: Vec::new(),
            })
        }
        None => Ok(RuntimeResponse {
            request_id,
            protocol_version: PROTOCOL_VERSION,
            status: "error".to_string(),
            payload: Some(RuntimeHealthResult {
                status: "offline".to_string(),
                version: None,
                executable: None,
                source: None,
                managed: false,
                security,
                message: "Bu build içinde gömülü Python bulunamadı ve sistem Python 3 yorumlayıcısı da kullanılamıyor."
                    .to_string(),
            }),
            diagnostics: vec![RuntimeDiagnostic {
                severity: "error".to_string(),
                code: "PYTHON_NOT_FOUND".to_string(),
                message: "Sistemde kullanılabilir bir Python 3 yorumlayıcısı bulunamadı."
                    .to_string(),
            }],
        }),
    }
}

fn execute_python_sync(
    app: &tauri::AppHandle,
    request: ExecutePythonRequest,
) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {
    validate_request(&request)?;

    let interpreter = find_python_interpreter(app)
        .ok_or_else(|| "Python 3 yorumlayıcısı bulunamadı.".to_string())?;
    let timeout_ms = request.timeout_ms.clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    let started_at = Instant::now();
    let workspace = create_secure_workspace(&request.request_id)?;
    let filename = sanitize_filename(&request.filename);
    let source_path = workspace.join(&filename);
    if let Err(error) = write_workspace_file(&source_path, request.source.as_bytes()) {
        let _ = fs::remove_dir_all(&workspace);
        return Err(error);
    }
    let workspace_text = workspace
        .to_str()
        .ok_or_else(|| "Güvenli çalışma alanı yolu UTF-8 değil.".to_string())?;

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
        .arg(&filename)
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
            return Err(format!("Python süreci başlatılamadı: {error}"));
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
                "Kod {timeout_ms} ms içinde tamamlanmadığı için bütün süreç ağacı durduruldu."
            ),
        });
    }
    if outcome.workspace_limit_exceeded {
        diagnostics.push(RuntimeDiagnostic {
            severity: "error".to_string(),
            code: "WORKSPACE_LIMIT_EXCEEDED".to_string(),
            message: "Kod çalışma alanı dosya veya boyut sınırını aştığı için durduruldu."
                .to_string(),
        });
    }
    if policy_violation {
        diagnostics.push(RuntimeDiagnostic {
            severity: "error".to_string(),
            code: "SANDBOX_POLICY_VIOLATION".to_string(),
            message: "Kod güvenli çalışma alanı politikasının engellediği bir işlem denedi."
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

fn validate_request(request: &ExecutePythonRequest) -> Result<(), String> {
    if request.source.len() > MAX_SOURCE_BYTES {
        return Err(format!(
            "Kaynak kod {} KB sınırını aşıyor.",
            MAX_SOURCE_BYTES / 1024
        ));
    }

    let stdin_size = request.stdin.iter().map(String::len).sum::<usize>();
    if stdin_size > MAX_STDIN_BYTES {
        return Err(format!(
            "Girdi verisi {} KB sınırını aşıyor.",
            MAX_STDIN_BYTES / 1024
        ));
    }

    Ok(())
}

fn sanitize_filename(filename: &str) -> String {
    let candidate = Path::new(filename)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("main.py");
    let mut sanitized = sanitize_component(candidate);

    if sanitized.is_empty() {
        sanitized = "main.py".to_string();
    }
    if !sanitized.ends_with(".py") {
        sanitized.push_str(".py");
    }

    sanitized
}

fn sanitize_component(value: &str) -> String {
    value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
        .take(80)
        .collect()
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
    use super::{sandbox_policy_violation, sanitize_component, sanitize_filename};

    #[test]
    fn filename_removes_parent_directory_segments() {
        assert_eq!(sanitize_filename("../../lesson.py"), "lesson.py");
    }

    #[test]
    fn filename_gets_python_extension() {
        assert_eq!(sanitize_filename("lesson"), "lesson.py");
    }

    #[test]
    fn request_component_allows_only_safe_characters() {
        assert_eq!(sanitize_component("run:01 / demo"), "run01demo");
    }

    #[test]
    fn detects_known_sandbox_policy_messages() {
        assert!(sandbox_policy_violation(
            "PermissionError: Ders çalışma alanında ağ erişimi kapalıdır."
        ));
        assert!(!sandbox_policy_violation(
            "PermissionError: kullanıcı hatası"
        ));
    }
}
