use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env, fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::{Command, ExitStatus, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const PROTOCOL_VERSION: u8 = 1;
const MAX_PROJECT_BYTES: usize = 256 * 1024;
const MAX_STDIN_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const MAX_FILE_COUNT: usize = 64;
const MIN_TIMEOUT_MS: u64 = 250;
const MAX_TIMEOUT_MS: u64 = 10_000;
const PROJECT_RUNNER: &str = r#"import os, runpy, sys
root = sys.argv[1]
entrypoint = sys.argv[2]
sys.path.insert(0, root)
sys.argv = [entrypoint]
os.chdir(root)
runpy.run_path(os.path.join(root, entrypoint), run_name='__main__')"#;

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

#[derive(Clone, Debug)]
struct PythonInterpreter {
    executable: String,
    prefix_args: Vec<String>,
}

#[derive(Debug)]
struct CapturedOutput {
    text: String,
    truncated: bool,
}

#[tauri::command]
pub async fn execute_python_project(
    request: ExecutePythonProjectRequest,
) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {
    tauri::async_runtime::spawn_blocking(move || execute_python_project_sync(request))
        .await
        .map_err(|error| format!("Python proje görevi tamamlanamadı: {error}"))?
}

fn execute_python_project_sync(
    request: ExecutePythonProjectRequest,
) -> Result<RuntimeResponse<ExecuteCodeResult>, String> {
    let validated_files = validate_request(&request)?;
    let interpreter = find_python_interpreter()
        .ok_or_else(|| "Python 3 yorumlayıcısı bulunamadı.".to_string())?;
    let timeout_ms = request.timeout_ms.clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
    let started_at = Instant::now();
    let workspace = create_workspace(&request.request_id)?;

    for (relative_path, content) in &validated_files {
        let target = workspace.join(relative_path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Proje klasörü oluşturulamadı: {error}"))?;
        }
        fs::write(&target, content.as_bytes())
            .map_err(|error| format!("Proje dosyası yazılamadı: {error}"))?;
    }

    let entrypoint = validate_relative_python_path(&request.entrypoint)?;
    let entrypoint_text = entrypoint
        .to_str()
        .ok_or_else(|| "Giriş dosyası yolu UTF-8 değil.".to_string())?;
    let workspace_text = workspace
        .to_str()
        .ok_or_else(|| "Geçici proje yolu UTF-8 değil.".to_string())?;

    let mut command = Command::new(&interpreter.executable);
    command
        .args(&interpreter.prefix_args)
        .arg("-I")
        .arg("-X")
        .arg("utf8")
        .arg("-B")
        .arg("-c")
        .arg(PROJECT_RUNNER)
        .arg(workspace_text)
        .arg(entrypoint_text)
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
        .map_err(|error| format!("Python proje süreci başlatılamadı: {error}"))?;
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
    let stdout = stdout_reader.join().unwrap_or_else(|_| CapturedOutput {
        text: String::new(),
        truncated: false,
    });
    let stderr = stderr_reader.join().unwrap_or_else(|_| CapturedOutput {
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
            message: format!("Proje {timeout_ms} ms içinde tamamlanmadığı için durduruldu."),
        });
    }
    if truncated {
        diagnostics.push(RuntimeDiagnostic {
            severity: "warning".to_string(),
            code: "OUTPUT_TRUNCATED".to_string(),
            message: "Terminal çıktısı güvenli boyut sınırını aştığı için kısaltıldı."
                .to_string(),
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

fn validate_request(
    request: &ExecutePythonProjectRequest,
) -> Result<Vec<(PathBuf, String)>, String> {
    if request.files.is_empty() {
        return Err("Python projesinde en az bir dosya bulunmalıdır.".to_string());
    }
    if request.files.len() > MAX_FILE_COUNT {
        return Err(format!("Proje en fazla {MAX_FILE_COUNT} dosya içerebilir."));
    }

    let total_size = request.files.iter().map(|file| file.content.len()).sum::<usize>();
    if total_size > MAX_PROJECT_BYTES {
        return Err(format!(
            "Proje kaynak kodu {} KB sınırını aşıyor.",
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
        let path = validate_relative_python_path(&file.path)?;
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
    if value.trim().is_empty() || value.contains('\\') {
        return Err("Python dosya yolu geçersiz.".to_string());
    }

    let path = Path::new(value);
    if path.is_absolute() || path.extension().and_then(|value| value.to_str()) != Some("py") {
        return Err(format!("Yalnız göreli .py dosya yollarına izin verilir: {value}"));
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
                        character.is_ascii_alphanumeric()
                            || matches!(character, '-' | '_' | '.')
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
        return Err("Python dosya yolu boş olamaz.".to_string());
    }
    Ok(safe_path)
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
    let safe_request_id: String = request_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(80)
        .collect();
    let workspace = env::temp_dir().join(format!(
        "python-farming-project-{}-{}-{}",
        std::process::id(),
        timestamp,
        safe_request_id
    ));
    fs::create_dir_all(&workspace)
        .map_err(|error| format!("Geçici proje klasörü oluşturulamadı: {error}"))?;
    Ok(workspace)
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
                return Err(format!("Python proje süreci izlenemedi: {error}"));
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
    use super::validate_relative_python_path;
    use std::path::PathBuf;

    #[test]
    fn package_paths_are_preserved() {
        assert_eq!(
            validate_relative_python_path("magaza/__init__.py").unwrap(),
            PathBuf::from("magaza/__init__.py")
        );
    }

    #[test]
    fn parent_directory_paths_are_rejected() {
        assert!(validate_relative_python_path("../secret.py").is_err());
    }

    #[test]
    fn absolute_and_non_python_paths_are_rejected() {
        assert!(validate_relative_python_path("/tmp/main.py").is_err());
        assert!(validate_relative_python_path("notes.txt").is_err());
    }
}
