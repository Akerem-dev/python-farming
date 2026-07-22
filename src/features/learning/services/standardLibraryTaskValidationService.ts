import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeSourceFile,
} from "../../../runtime/runtimeProtocol";
import type { TaskValidationSpec } from "../taskValidationTypes";
import { parseTaskValidationOutput } from "./taskValidationService";

const VALIDATOR_PATH = "__python_farming_standard_library_validator__.py";

const VALIDATOR_SOURCE = String.raw`
import ast
import collections
import contextlib
import datetime
import decimal
import enum
import importlib
import io
import json
import os
import runpy
import sys
import time
import traceback

payload = json.loads(sys.stdin.read())
file_paths = payload["files"]
entrypoint = payload["entrypoint"]
stdin_lines = payload.get("stdin", [])
spec = payload["spec"]
started_at = time.perf_counter()
sys.dont_write_bytecode = True


def dotted_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return None


def decorator_name(node):
    return dotted_name(node.func) if isinstance(node, ast.Call) else dotted_name(node)


def empty_data():
    return {"decorators": {}}


file_data = {}
syntax_errors = {}
for path in file_paths:
    if path == ${JSON.stringify(VALIDATOR_PATH)}:
        continue
    try:
        source = open(path, "r", encoding="utf-8").read()
    except (OSError, UnicodeError) as error:
        syntax_errors[path] = f"Dosya okunamadı: {error}"
        continue

    data = empty_data()
    file_data[path] = data
    if not path.endswith(".py"):
        continue
    try:
        tree = ast.parse(source, filename=path, mode="exec")
    except SyntaxError as error:
        syntax_errors[path] = f"{error.msg} (satır {error.lineno or 0})"
        continue

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            data["decorators"][node.name] = {
                name.split(".")[-1]
                for item in node.decorator_list
                if (name := decorator_name(item))
            }


def selected_data(check):
    requested = check.get("file")
    if requested:
        return file_data.get(requested, empty_data())
    combined = empty_data()
    for data in file_data.values():
        combined["decorators"].update(data["decorators"])
    return combined


def inferred_module(check):
    if check.get("module"):
        return check["module"]
    file_name = check.get("file")
    if file_name and file_name.endswith(".py") and file_name != entrypoint:
        return file_name[:-3].replace("/", ".")
    return None


def resolve_namespace(check, fallback):
    module_name = inferred_module(check)
    return importlib.import_module(module_name).__dict__ if module_name else fallback


def resolve_function(check, fallback):
    candidate = resolve_namespace(check, fallback).get(check["name"])
    return candidate if callable(candidate) else None


def resolve_enum(check, fallback):
    candidate = resolve_namespace(check, fallback).get(check["name"])
    if isinstance(candidate, type) and issubclass(candidate, enum.Enum):
        return candidate
    return None


def normalize_value(value):
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, enum.Enum):
        return normalize_value(value.value)
    if isinstance(value, collections.Counter):
        return {str(key): normalize_value(item) for key, item in value.items()}
    if isinstance(value, collections.defaultdict):
        return {str(key): normalize_value(item) for key, item in value.items()}
    if isinstance(value, collections.deque):
        return [normalize_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): normalize_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize_value(item) for item in value]
    if isinstance(value, (set, frozenset)):
        return sorted(normalize_value(item) for item in value)
    return value


def type_name(value):
    return type(value).__name__


def timezone_aware(value):
    return (
        isinstance(value, datetime.datetime)
        and value.tzinfo is not None
        and value.utcoffset() is not None
    )


def result_item(check, passed, message):
    return {
        "id": check["id"],
        "label": check["label"],
        "visibility": check["visibility"],
        "passed": bool(passed),
        "message": message,
    }


namespace = {"__name__": "__main__"}
stdout_buffer = io.StringIO()
stderr_buffer = io.StringIO()
runtime_error = None
if not syntax_errors:
    previous_stdin = sys.stdin
    input_text = "\n".join(stdin_lines)
    if input_text and not input_text.endswith("\n"):
        input_text += "\n"
    sys.stdin = io.StringIO(input_text)
    sys.path.insert(0, os.getcwd())
    try:
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            namespace = runpy.run_path(entrypoint, run_name="__main__")
    except BaseException:
        runtime_error = traceback.format_exc()
    finally:
        sys.stdin = previous_stdin

stdout = stdout_buffer.getvalue()
stderr = stderr_buffer.getvalue()
results = []

for check in spec.get("checks", []):
    kind = check.get("kind")
    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        results.append(result_item(check, False, f"{path} sözdizimi hatası: {error}"))
        continue

    if kind == "decorator_usage":
        decorators = selected_data(check)["decorators"].get(check["name"], set())
        accepted = {name.split(".")[-1] for name in check.get("accepted", [])}
        matched = sorted(decorators & accepted)
        passed = bool(matched)
        message = (
            f"{check['name']} fonksiyonunda {matched[0]} dekoratörü bulundu."
            if passed
            else f"{check['name']} fonksiyonunda beklenen dekoratör bulunamadı."
        )
        results.append(result_item(check, passed, message))
        continue

    if runtime_error is not None:
        results.append(result_item(check, False, "Proje çalışırken yakalanmamış bir Python hatası oluştu."))
        continue

    if kind == "enum_definition":
        try:
            target = resolve_enum(check, namespace)
        except BaseException:
            target = None
        expected = check.get("members", {})
        actual = (
            {name: normalize_value(member.value) for name, member in target.__members__.items()}
            if target is not None
            else None
        )
        passed = target is not None and actual == expected
        message = (
            f"{check['name']} Enum üyeleri doğru."
            if passed
            else f"{check['name']} Enum üyeleri beklenen sözleşmeyle eşleşmiyor."
        )
        results.append(result_item(check, passed, message))
        continue

    if kind == "stdlib_function_cases":
        try:
            function = resolve_function(check, namespace)
        except BaseException:
            function = None
        cases = check.get("cases", [])
        passed = callable(function) and bool(cases)
        message = f"{check['name']} standart kütüphane senaryoları geçti."

        if not callable(function):
            passed = False
            message = f"{check['name']} çalıştırılabilir bir fonksiyon değil."
        elif not cases:
            passed = False
            message = "Gizli fonksiyon senaryosu tanımlanmamış."
        else:
            for index, case in enumerate(cases, start=1):
                try:
                    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                        actual_value = function(*case.get("args", []), **case.get("kwargs", {}))
                except BaseException as error:
                    passed = False
                    message = f"Gizli senaryo {index} hata verdi: {type(error).__name__}."
                    break

                expected_type = case.get("expectedType")
                if expected_type and type_name(actual_value) != expected_type:
                    passed = False
                    message = (
                        f"Gizli senaryo {index} {expected_type} bekliyordu; "
                        f"alınan: {type_name(actual_value)}."
                    )
                    break

                if case.get("timezoneAware") is True and not timezone_aware(actual_value):
                    passed = False
                    message = f"Gizli senaryo {index} timezone-aware datetime döndürmelidir."
                    break

                if "expected" in case:
                    actual = normalize_value(actual_value)
                    if actual != case.get("expected"):
                        passed = False
                        message = (
                            f"Gizli senaryo {index} beklenen sonucu vermedi "
                            f"(beklenen: {case.get('expected')!r}, dönen: {actual!r})."
                        )
                        break

        results.append(result_item(check, passed, message))
        continue

    results.append(result_item(
        check,
        False,
        f"Standart kütüphane doğrulayıcısında desteklenmeyen kontrol türü: {kind}",
    ))

passed_count = sum(1 for item in results if item["passed"])
total_count = len(results)
score = round((passed_count / total_count) * 100) if total_count else 0
result = {
    "taskId": spec["id"],
    "passed": total_count > 0 and passed_count == total_count and runtime_error is None,
    "score": score,
    "checks": results,
    "stdout": stdout,
    "stderr": stderr,
    "runtimeError": runtime_error,
    "durationMs": round((time.perf_counter() - started_at) * 1000),
}
print(json.dumps(result, ensure_ascii=False))
`;

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `standard-library-validation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function validateStandardLibraryTask(options: {
  files: RuntimeSourceFile[];
  entrypoint: string;
  stdin: string[];
  spec: TaskValidationSpec;
}) {
  const validatorFile = { path: VALIDATOR_PATH, content: VALIDATOR_SOURCE };
  const projectFiles = [validatorFile, ...options.files];
  const response = await runtimeClient.send<ExecuteCodeResult>({
    requestId: createRequestId(),
    protocolVersion: runtimeProtocolVersion,
    kind: "execute_code",
    payload: {
      source: VALIDATOR_SOURCE,
      filename: VALIDATOR_PATH,
      files: projectFiles,
      entrypoint: VALIDATOR_PATH,
      stdin: [
        JSON.stringify({
          files: projectFiles.map((file) => file.path),
          entrypoint: options.entrypoint,
          stdin: options.stdin,
          spec: options.spec,
        }),
      ],
      timeoutMs: options.spec.timeoutMs,
    },
  });

  if (!response.payload) {
    throw new Error("Standart kütüphane doğrulama motoru sonuç verisi döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(
      diagnostic || runtimeMessage || "Standart kütüphane doğrulama motoru çalıştırılamadı.",
    );
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
