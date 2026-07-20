use serde::{Deserialize, Serialize};
use std::{
    env,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, ExitStatus, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
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

#[derive(Clone, Debug)]
struct PythonInterpreter {
    executable: String,
    prefix_args: Vec<String>,
    version: String,
}

#[derive(Debug)]
struct CapturedOutput {
    text: String,
    truncated: bool,
}

#[tauri::command]
pub async fn runtime_health_check(
    request_id: String,
) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {
    tauri::async_runtime::spawn_blocking(move || runtime_health_check_sync(request_id))
        .await
        .map_err(|error| format!("Runtime sağlık kontrolü tamamlanamadı: {error}"))?
}

#[tauri::command]
pub async fn execute_python(
    request: ExecutePythonRequest,
) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {
    tauri::async_runtime::spawn_blocking(move || execute_python_sync(request))
        .await
        .map_err(|error| format!("Python çalışma görevi tamamlanamadı: {error}"))?
}

fn runtime_health_check_sync(
    request_id: String,
) -> Result<RuntimeResponse<RuntimeHealthResult>, String> {
    match find_python_interpreter() {
        Some(interpreter) => Ok(RuntimeResponse {
            request_id,
            protocol_version: PROTOCOL_VERSION,
            status: "ok".to_string(),
            payload: Some(RuntimeHealthResult {
                status: "ready".to_string(),
                version: Some(interpreter.version),
                executable: Some(interpreter.executable),
                message: "Yerel Python yorumlayıcısı kullanıma hazır.".to_string(),
            }),
            diagnostics: Vec::new(),
        }),
        None => Ok(RuntimeResponse {
            request_id,
            protocol_version: PROTOCOL_VERSION,
            status: "error".to_string(),
            payload: Some(RuntimeHealthResult {
                status: "offline".to_string(),
                version: None,
                executable: None,
                message: "Python 3 bulunamadı. Geliştirme sürümünde kod çalıştırmak için Python 3 kurulmalıdır."
                    .to_string(),
            }),
            diagnostics: vec![RuntimeDiagnostic {
                severity: "error".to_string(),
                code: "PYTHON_NOT_FOUND".to_string(),
                message: "Sistemde kullanılabilir bir Python 3 yorumlayıcısı bulunamadı.".to_string(),
            }],
        }),
    }
}

fn execute_python_sync(
    request: ExecutePythonRequest,
) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {
    validate_request(&request)?;

    let interpreter = find_python_interpreter()
        .ok_or_else(|| "Python 3 yorumlayıcısı bulunamadı.".to_string())?;
    let timeout_ms = request.timeout_ms.clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    let started_at = Instant::now();
    let workspace = create_workspace(&request.request_id)?;
    let filename = sanitize_filename(&request.filename);
    let source_path = workspace.join(filename);

    fs::write(&source_path, request.source.as_bytes())
        .map_err(|error| format!("Geçici Python dosyası yazılamadı: {error}"))?;

    let mut command = Command::new(&interpreter.executable);
    command
        .args(&interpreter.prefix_args)
        .arg("-I")
        .arg("-B")
        .arg(&source_path)
        .current_dir(&workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONHOME")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1");
    hide_console_window(&mut command);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Python süreci başlatılamadı: {error}"))?;

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
        stdin
            .write_all(input.as_bytes())
            .map_err(|error| format!("Python stdin verisi gönderilemedi: {error}"))?;
    }

    let timeout = Duration::from_millis(timeout_ms);
    let (exit_status, timed_out) = wait_for_child(&mut child, timeout)?;
    let stdout = stdout_reader
        .join()
        .unwrap_or_else(|_| CapturedOutput {
            text: String::new(),
            truncated: false,
        });
    let stderr = stderr_reader
        .join()
        .unwrap_or_else(|_| CapturedOutput {
            text: "Python stderr çıktısı okunamadı.".to_string(),
            truncated: false,
        });

    let duration_ms = started_at.elapsed().as_millis().min(u64::MAX as u128) as u64;
    let truncated = stdout.truncated || stderr.truncated;
    let _ = fs::remove_dir_all(&workspace);

    let status = if timed_out {
        "timeout"
    } else if exit_status.as_ref().is_some_and(ExitStatus::success) {
        "ok"
    } else {
        "error"
    };

    let mut diagnostics = Vec::new();
    if timed_out {
        diagnostics.push(RuntimeDiagnostic {
            severity: "error".to_string(),
            code: "EXECUTION_TIMEOUT".to_string(),
            message: format!("Kod {timeout_ms} ms içinde tamamlanmadığı için durduruldu."),
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
            exit_code: exit_status.and_then(|value| value.code()),
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

fn find_python_interpreter() -> Option<PythonInterpreter> {
    for (executable, prefix_args) in interpreter_candidates() {
        let mut command = Command::new(&executable);
        command.args(&prefix_args).arg("--version");
        hide_console_window(&mut command);

        let Ok(output) = command.output() else {
            continue;
        };

        if !output.status.success() {
            continue;
        }

        let mut version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if version.is_empty() {
            version = String::from_utf8_lossy(&output.stderr).trim().to_string();
        }

        if version.starts_with("Python 3") {
            return Some(PythonInterpreter {
                executable,
                prefix_args,
                version,
            });
        }
    }

    None
}

fn interpreter_candidates() -> Vec<(String, Vec<String>)> {
    let mut candidates = Vec::new();

    if let Ok(custom_python) = env::var("PYTHON_FARMING_PYTHON") {
        if !custom_python.trim().is_empty() {
            candidates.push((custom_python, Vec::new()));
        }
    }

    #[cfg(target_os = "windows")]
    {
        candidates.push(("py".to_string(), vec!["-3".to_string()]));
        candidates.push(("python".to_string(), Vec::new()));
        candidates.push(("python3".to_string(), Vec::new()));
    }

    #[cfg(not(target_os = "windows"))]
    {
        candidates.push(("python3".to_string(), Vec::new()));
        candidates.push(("python".to_string(), Vec::new()));
    }

    candidates
}

fn create_workspace(request_id: &str) -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let safe_request_id = sanitize_component(request_id);
    let workspace = env::temp_dir().join(format!(
        "python-farming-{}-{}-{}",
        std::process::id(),
        timestamp,
        safe_request_id
    ));

    fs::create_dir_all(&workspace)
        .map_err(|error| format!("Geçici çalışma alanı oluşturulamadı: {error}"))?;
    Ok(workspace)
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

fn wait_for_child(
    child: &mut std::process::Child,
    timeout: Duration,
) -> Result<(Option<ExitStatus>, bool), String> {
    let started_at = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok((Some(status), false)),
            Ok(None) if started_at.elapsed() >= timeout => {
                let _ = child.kill();
                let status = child.wait().ok();
                return Ok((status, true));
            }
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Python süreci izlenemedi: {error}"));
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn hide_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console_window(_command: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::{sanitize_component, sanitize_filename};

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
}
