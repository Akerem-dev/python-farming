use serde::Deserialize;
use std::{
    env, fs,
    path::{Component, Path, PathBuf},
    process::Command,
};
use tauri::Manager;

const RUNTIME_DIRECTORY: &str = "python-runtime";
const RUNTIME_MANIFEST: &str = "runtime-manifest.json";
const RUNTIME_MANIFEST_SCHEMA_VERSION: u32 = 1;
const MAX_RUNTIME_MANIFEST_BYTES: u64 = 64 * 1024;

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BundledRuntimeManifest {
    schema_version: u32,
    provider: String,
    release_tag: String,
    python_series: String,
    target: String,
    asset: String,
    digest: String,
    archive: String,
    executable_relative_path: String,
    verified_at: String,
    host_validated_version: Option<String>,
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
        .filter_map(|root| bundled_executable(&root))
        .map(|executable| InterpreterCandidate {
            executable,
            prefix_args: Vec::new(),
            source: PythonInterpreterSource::Bundled,
            must_exist: true,
        })
        .collect()
}

fn bundled_executable(root: &Path) -> Option<PathBuf> {
    let manifest_path = root.join(RUNTIME_MANIFEST);
    let metadata = fs::metadata(&manifest_path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_RUNTIME_MANIFEST_BYTES {
        return None;
    }
    let manifest: BundledRuntimeManifest =
        serde_json::from_slice(&fs::read(manifest_path).ok()?).ok()?;
    if manifest.schema_version != RUNTIME_MANIFEST_SCHEMA_VERSION
        || manifest.provider != "astral-sh/python-build-standalone"
        || !manifest.digest.starts_with("sha256:")
        || manifest.release_tag.is_empty()
        || manifest.python_series.is_empty()
        || manifest.target.is_empty()
        || manifest.asset.is_empty()
        || manifest.archive.is_empty()
        || manifest.verified_at.is_empty()
    {
        return None;
    }
    let _ = manifest.host_validated_version;
    validated_relative_executable(root, &manifest.executable_relative_path)
}

fn validated_relative_executable(root: &Path, value: &str) -> Option<PathBuf> {
    if value.is_empty() || value.trim() != value {
        return None;
    }
    let relative = Path::new(value);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return None;
    }
    let executable = root.join(relative);
    executable.is_file().then_some(executable)
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
    use super::{bundled_executable, validated_relative_executable};
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temporary_directory(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "python-farming-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("temporary directory should be created");
        path
    }

    #[test]
    fn accepts_only_executables_inside_the_runtime_root() {
        let root = temporary_directory("runtime-manifest-path");
        let executable = root.join("python/bin/python3.13");
        fs::create_dir_all(executable.parent().expect("parent should exist"))
            .expect("runtime bin should be created");
        fs::write(&executable, b"python").expect("runtime executable fixture should be written");

        assert_eq!(
            validated_relative_executable(&root, "python/bin/python3.13"),
            Some(executable)
        );
        assert!(validated_relative_executable(&root, "../python3").is_none());
        assert!(validated_relative_executable(&root, "/usr/bin/python3").is_none());

        fs::remove_dir_all(root).expect("temporary directory should be removed");
    }

    #[test]
    fn loads_a_verified_bundled_runtime_manifest() {
        let root = temporary_directory("runtime-manifest");
        let executable = root.join("python/bin/python3.13");
        fs::create_dir_all(executable.parent().expect("parent should exist"))
            .expect("runtime bin should be created");
        fs::write(&executable, b"python").expect("runtime executable fixture should be written");
        fs::write(
            root.join("runtime-manifest.json"),
            r#"{
              "schemaVersion": 1,
              "provider": "astral-sh/python-build-standalone",
              "releaseTag": "20260510",
              "pythonSeries": "3.13",
              "target": "x86_64-unknown-linux-gnu",
              "asset": "cpython.tar.gz",
              "digest": "sha256:abc",
              "archive": "cpython.tar.gz",
              "executableRelativePath": "python/bin/python3.13",
              "verifiedAt": "2026-07-26T00:00:00.000Z",
              "hostValidatedVersion": "Python 3.13.11"
            }"#,
        )
        .expect("runtime manifest should be written");

        assert_eq!(bundled_executable(&root), Some(executable));
        fs::remove_dir_all(root).expect("temporary directory should be removed");
    }
}
