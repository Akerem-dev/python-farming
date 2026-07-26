use serde::Serialize;
use std::{
    env, fs, io,
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub(super) const SANDBOX_POLICY_VERSION: u8 = 1;
pub(super) const MAX_WORKSPACE_BYTES: u64 = 16 * 1024 * 1024;
pub(super) const MAX_WORKSPACE_FILES: usize = 512;
const WORKSPACE_CHECK_INTERVAL: Duration = Duration::from_millis(100);
const WAIT_POLL_INTERVAL: Duration = Duration::from_millis(10);

pub(super) const PYTHON_SANDBOX_RUNNER: &str = r#"import os, runpy, sys
root = os.path.realpath(os.path.abspath(sys.argv[1]))
entrypoint = sys.argv[2]
os.chdir(root)
sys.path.insert(0, root)
sys.argv = [entrypoint]


def normalized_path(value):
    if isinstance(value, int):
        return None
    try:
        path = os.path.abspath(os.fspath(value))
    except (TypeError, ValueError):
        return None
    if os.path.lexists(path):
        return os.path.realpath(path)
    parent = os.path.realpath(os.path.dirname(path) or root)
    return os.path.join(parent, os.path.basename(path))


def inside(path, directory):
    return path == directory or path.startswith(directory + os.sep)


runtime_read_roots = []
for candidate in sys.path:
    if not candidate:
        continue
    resolved = os.path.realpath(candidate)
    if resolved != root and resolved not in runtime_read_roots:
        runtime_read_roots.append(resolved)

system_read_roots = []
if os.name == 'nt':
    for key in ('SystemRoot', 'WINDIR'):
        value = os.environ.get(key)
        if value:
            system_read_roots.append(os.path.realpath(value))
else:
    system_read_roots.extend(['/usr/share/zoneinfo', '/usr/lib/locale'])

allowed_special_files = {
    os.path.realpath(value)
    for value in ('/dev/null', '/dev/urandom', '/dev/random', '/etc/localtime')
    if os.path.exists(value)
}


def inside_workspace(value):
    path = normalized_path(value)
    return path is None or inside(path, root)


def readable_path(value):
    path = normalized_path(value)
    if path is None or inside(path, root) or path in allowed_special_files:
        return True
    return any(inside(path, directory) for directory in runtime_read_roots + system_read_roots)


def require_workspace(value, message):
    if not inside_workspace(value):
        raise PermissionError(message)


def require_readable(value):
    if not readable_path(value):
        raise PermissionError('Çalışma alanı dışındaki dosyalar okunamaz.')


def audit(event, args):
    if event == 'open' and args:
        target = args[0]
        mode = args[1] if len(args) > 1 and isinstance(args[1], str) else 'r'
        flags = args[2] if len(args) > 2 and isinstance(args[2], int) else 0
        write_flags = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND
        wants_write = any(marker in mode for marker in ('w', 'a', 'x', '+')) or bool(flags & write_flags)
        if wants_write:
            require_workspace(target, 'Çalışma alanı dışına dosya yazılamaz.')
        else:
            require_readable(target)
        return

    if event in {'os.listdir', 'os.scandir'} and args:
        require_readable(args[0])
        return

    if event in {
        'os.remove', 'os.unlink', 'os.rmdir', 'os.mkdir', 'os.chdir',
        'os.chmod', 'os.chown', 'os.truncate', 'os.utime'
    } and args:
        require_workspace(args[0], 'Çalışma alanı dışında dosya sistemi işlemi yapılamaz.')
        return

    if event in {'os.rename', 'os.replace', 'os.link'} and len(args) >= 2:
        require_workspace(args[0], 'Çalışma alanı dışından dosya taşınamaz.')
        require_workspace(args[1], 'Çalışma alanı dışına dosya taşınamaz.')
        return

    if event == 'os.symlink':
        raise PermissionError('Ders çalışma alanında sembolik bağlantı oluşturma kapalıdır.')

    if event in {
        'subprocess.Popen', 'os.system', 'os.posix_spawn', 'os.posix_spawnp',
        'os.fork', 'os.forkpty', 'pty.spawn'
    }:
        raise PermissionError('Ders çalışma alanında dış süreç oluşturma kapalıdır.')

    if event.startswith('socket.'):
        raise PermissionError('Ders çalışma alanında ağ erişimi kapalıdır.')

    if event in {'ctypes.dlopen', 'ctypes.dlsym', 'ctypes.dlsym/handle'}:
        raise PermissionError('Ders çalışma alanında yerel kütüphane yükleme kapalıdır.')


sys.addaudithook(audit)
runpy.run_path(os.path.join(root, entrypoint), run_name='__main__')"#;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RuntimeSecurityProfile {
    policy_version: u8,
    filesystem_scope: String,
    network_access: String,
    subprocess_access: String,
    environment_isolated: bool,
    process_tree_termination: bool,
    max_workspace_bytes: u64,
    max_workspace_files: usize,
}

#[derive(Debug)]
pub(super) struct SandboxWaitOutcome {
    pub(super) exit_status: Option<ExitStatus>,
    pub(super) timed_out: bool,
    pub(super) workspace_limit_exceeded: bool,
}

pub(super) fn security_profile() -> RuntimeSecurityProfile {
    RuntimeSecurityProfile {
        policy_version: SANDBOX_POLICY_VERSION,
        filesystem_scope: "workspace-only".to_string(),
        network_access: "blocked".to_string(),
        subprocess_access: "blocked".to_string(),
        environment_isolated: true,
        process_tree_termination: true,
        max_workspace_bytes: MAX_WORKSPACE_BYTES,
        max_workspace_files: MAX_WORKSPACE_FILES,
    }
}

pub(super) fn create_secure_workspace(request_id: &str) -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let safe_request_id = sanitize_component(request_id);
    let workspace = env::temp_dir().join(format!(
        "python-farming-{}-{}-{}",
        std::process::id(),
        timestamp,
        if safe_request_id.is_empty() {
            "run"
        } else {
            safe_request_id.as_str()
        }
    ));
    fs::create_dir_all(&workspace)
        .map_err(|error| format!("Güvenli çalışma alanı oluşturulamadı: {error}"))?;
    restrict_directory_permissions(&workspace)?;
    Ok(workspace)
}

pub(super) fn write_workspace_file(path: &Path, content: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Çalışma alanı klasörü oluşturulamadı: {error}"))?;
        restrict_directory_permissions(parent)?;
    }
    fs::write(path, content)
        .map_err(|error| format!("Çalışma alanı dosyası yazılamadı: {error}"))?;
    restrict_file_permissions(path)
}

pub(super) fn configure_sandbox_command(
    command: &mut Command,
    workspace: &Path,
) -> Result<(), String> {
    let workspace_text = workspace
        .to_str()
        .ok_or_else(|| "Güvenli çalışma alanı yolu UTF-8 değil.".to_string())?;

    command.env_clear();
    for key in ["SystemRoot", "WINDIR", "LANG", "LC_ALL", "LC_CTYPE"] {
        if let Ok(value) = env::var(key) {
            if value.len() <= 4096 {
                command.env(key, value);
            }
        }
    }
    command
        .env("HOME", workspace_text)
        .env("USERPROFILE", workspace_text)
        .env("TMPDIR", workspace_text)
        .env("TEMP", workspace_text)
        .env("TMP", workspace_text)
        .env("PATH", "")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONHASHSEED", "0")
        .env("PYTHON_FARMING_WORKSPACE", workspace_text);
    configure_process_group(command);
    Ok(())
}

pub(super) fn wait_for_sandboxed_child(
    child: &mut Child,
    workspace: &Path,
    timeout: Duration,
) -> Result<SandboxWaitOutcome, String> {
    let started_at = Instant::now();
    let mut last_workspace_check = Instant::now()
        .checked_sub(WORKSPACE_CHECK_INTERVAL)
        .unwrap_or_else(Instant::now);

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Ok(SandboxWaitOutcome {
                    exit_status: Some(status),
                    timed_out: false,
                    workspace_limit_exceeded: false,
                });
            }
            Ok(None) if started_at.elapsed() >= timeout => {
                terminate_process_tree(child.id());
                let status = child.wait().ok();
                return Ok(SandboxWaitOutcome {
                    exit_status: status,
                    timed_out: true,
                    workspace_limit_exceeded: false,
                });
            }
            Ok(None) if last_workspace_check.elapsed() >= WORKSPACE_CHECK_INTERVAL => {
                last_workspace_check = Instant::now();
                let (bytes, files) = workspace_usage(workspace)
                    .map_err(|error| format!("Çalışma alanı kotası ölçülemedi: {error}"))?;
                if bytes > MAX_WORKSPACE_BYTES || files > MAX_WORKSPACE_FILES {
                    terminate_process_tree(child.id());
                    let status = child.wait().ok();
                    return Ok(SandboxWaitOutcome {
                        exit_status: status,
                        timed_out: false,
                        workspace_limit_exceeded: true,
                    });
                }
            }
            Ok(None) => thread::sleep(WAIT_POLL_INTERVAL),
            Err(error) => {
                terminate_process_tree(child.id());
                let _ = child.wait();
                return Err(format!("Python süreç ağacı izlenemedi: {error}"));
            }
        }
    }
}

fn workspace_usage(root: &Path) -> io::Result<(u64, usize)> {
    fn visit(path: &Path, bytes: &mut u64, files: &mut usize) -> io::Result<()> {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let metadata = fs::symlink_metadata(entry.path())?;
            if metadata.file_type().is_symlink() {
                *files = files.saturating_add(1);
                *bytes = bytes.saturating_add(metadata.len());
            } else if metadata.is_dir() {
                visit(&entry.path(), bytes, files)?;
            } else if metadata.is_file() {
                *files = files.saturating_add(1);
                *bytes = bytes.saturating_add(metadata.len());
            }
            if *bytes > MAX_WORKSPACE_BYTES || *files > MAX_WORKSPACE_FILES {
                return Ok(());
            }
        }
        Ok(())
    }

    let mut bytes = 0_u64;
    let mut files = 0_usize;
    visit(root, &mut bytes, &mut files)?;
    Ok((bytes, files))
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

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(target_os = "windows")]
fn configure_process_group(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    command.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
}

#[cfg(all(not(unix), not(target_os = "windows")))]
fn configure_process_group(_command: &mut Command) {}

#[cfg(unix)]
fn terminate_process_tree(process_id: u32) {
    extern "C" {
        fn kill(process_id: i32, signal: i32) -> i32;
    }
    const SIGKILL: i32 = 9;
    if let Ok(process_group) = i32::try_from(process_id) {
        unsafe {
            let _ = kill(-process_group, SIGKILL);
        }
    }
}

#[cfg(target_os = "windows")]
fn terminate_process_tree(process_id: u32) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let process_id = process_id.to_string();
    let mut command = Command::new("taskkill");
    command
        .args(["/PID", process_id.as_str(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW);
    let _ = command.status();
}

#[cfg(all(not(unix), not(target_os = "windows")))]
fn terminate_process_tree(_process_id: u32) {}

#[cfg(unix)]
fn restrict_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Çalışma alanı klasör izni ayarlanamadı: {error}"))
}

#[cfg(not(unix))]
fn restrict_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(unix)]
fn restrict_file_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("Çalışma alanı dosya izni ayarlanamadı: {error}"))
}

#[cfg(not(unix))]
fn restrict_file_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{security_profile, workspace_usage, write_workspace_file, MAX_WORKSPACE_FILES};
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn security_profile_reports_enforced_controls() {
        let profile = security_profile();
        assert_eq!(profile.policy_version, 1);
        assert_eq!(profile.filesystem_scope, "workspace-only");
        assert_eq!(profile.network_access, "blocked");
        assert_eq!(profile.subprocess_access, "blocked");
        assert!(profile.environment_isolated);
        assert!(profile.process_tree_termination);
    }

    #[test]
    fn workspace_usage_stops_after_file_limit() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("python-farming-quota-{nonce}"));
        fs::create_dir_all(&root).expect("fixture directory should be created");
        for index in 0..=MAX_WORKSPACE_FILES {
            write_workspace_file(&root.join(format!("{index}.txt")), b"x")
                .expect("fixture file should be written");
        }
        let (_, files) = workspace_usage(&root).expect("workspace usage should be measured");
        assert!(files > MAX_WORKSPACE_FILES);
        fs::remove_dir_all(root).expect("fixture directory should be removed");
    }
}
