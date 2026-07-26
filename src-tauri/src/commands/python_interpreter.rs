use std::{
    env,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::Manager;

const RUNTIME_DIRECTORY: &str = "python-runtime";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum PythonInterpreterSource {
    Custom,
    Bundled,
    System,
}

impl PythonInterpreterSource {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Custom => "custom",
            Self::Bundled => "bundled",
            Self::System => "system",
        }
    }

    pub(super) fn is_managed(self) -> bool {
        matches!(self, Self::Bundled)
    }
}

#[derive(Clone, Debug)]
pub(super) struct PythonInterpreter {
    pub(super) executable: PathBuf,
    pub(super) prefix_args: Vec<String>,
    pub(super) version: String,
    pub(super) source: PythonInterpreterSource,
}

#[derive(Clone, Debug)]
struct InterpreterCandidate {
    executable: PathBuf,
    prefix_args: Vec<String>,
    source: PythonInterpreterSource,
    must_exist: bool,
}

pub(super) fn find_python_interpreter(app: &tauri::AppHandle) -> Option<PythonInterpreter> {
    interpreter_candidates(app)
        .into_iter()
        .find_map(validate_candidate)
}

fn validate_candidate(candidate: InterpreterCandidate) -> Option<PythonInterpreter> {
    if candidate.must_exist && !candidate.executable.is_file() {
        return None;
    }

    let mut command = Command::new(&candidate.executable);
    command.args(&candidate.prefix_args).arg("--version");
    hide_console_window(&mut command);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }

    let mut version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        version = String::from_utf8_lossy(&output.stderr).trim().to_string();
    }
    if !version.starts_with("Python 3") {
        return None;
    }

    Some(PythonInterpreter {
        executable: candidate.executable,
        prefix_args: candidate.prefix_args,
        version,
        source: candidate.source,
    })
}

fn interpreter_candidates(app: &tauri::AppHandle) -> Vec<InterpreterCandidate> {
    let mut candidates = Vec::new();

    if let Ok(custom_python) = env::var("PYTHON_FARMING_PYTHON") {
        if !custom_python.trim().is_empty() {
            candidates.push(InterpreterCandidate {
                executable: PathBuf::from(custom_python),
                prefix_args: Vec::new(),
                source: PythonInterpreterSource::Custom,
                must_exist: false,
            });
        }
    }

    candidates.extend(bundled_candidates(app));
    candidates.extend(system_candidates());
    candidates
}

fn bundled_candidates(app: &tauri::AppHandle) -> Vec<InterpreterCandidate> {
    let Ok(resource_directory) = app.path().resource_dir() else {
        return Vec::new();
    };
    let roots = [
        resource_directory.join(RUNTIME_DIRECTORY),
        resource_directory.join("resources").join(RUNTIME_DIRECTORY),
    ];
    roots
        .into_iter()
        .flat_map(|root| bundled_executables(&root))
        .map(|executable| InterpreterCandidate {
            executable,
            prefix_args: Vec::new(),
            source: PythonInterpreterSource::Bundled,
            must_exist: true,
        })
        .collect()
}

fn bundled_executables(root: &Path) -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        vec![root.join("python").join("install").join("python.exe")]
    }

    #[cfg(not(target_os = "windows"))]
    {
        let binary_directory = root.join("python").join("install").join("bin");
        vec![binary_directory.join("python3"), binary_directory.join("python")]
    }
}

fn system_candidates() -> Vec<InterpreterCandidate> {
    #[cfg(target_os = "windows")]
    let values = [
        ("py", vec!["-3".to_string()]),
        ("python", Vec::new()),
        ("python3", Vec::new()),
    ];

    #[cfg(not(target_os = "windows"))]
    let values = [("python3", Vec::new()), ("python", Vec::new())];

    values
        .into_iter()
        .map(|(executable, prefix_args)| InterpreterCandidate {
            executable: PathBuf::from(executable),
            prefix_args,
            source: PythonInterpreterSource::System,
            must_exist: false,
        })
        .collect()
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
    use super::bundled_executables;
    use std::path::Path;

    #[test]
    fn bundled_runtime_paths_remain_inside_the_resource_root() {
        let root = Path::new("python-runtime");
        let candidates = bundled_executables(root);
        assert!(!candidates.is_empty());
        assert!(candidates.iter().all(|path| path.starts_with(root)));
        assert!(candidates
            .iter()
            .all(|path| path.to_string_lossy().contains("python/install")));
    }
}
