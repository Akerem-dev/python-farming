import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeSourceFile,
} from "../../../runtime/runtimeProtocol";
import type { TaskValidationSpec } from "../taskValidationTypes";
import { parseTaskValidationOutput } from "./taskValidationService";

const PROJECT_VALIDATOR_PATH = "__python_farming_project_validator__.py";

const PROJECT_VALIDATOR_SOURCE = String.raw`
import ast
import contextlib
import importlib
import io
import json
import os
import re
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

sources = {}
trees = {}
syntax_errors = {}
file_data = {}


def empty_data():
    return {
        "assigned": set(),
        "called": set(),
        "call_counts": {},
        "node_counts": {},
        "functions": {},
        "imports": set(),
    }


def collect_target(target, assigned):
    if isinstance(target, ast.Name):
        assigned.add(target.id)
    elif isinstance(target, (ast.Tuple, ast.List)):
        for element in target.elts:
            collect_target(element, assigned)


def collect_call(name, data):
    data["called"].add(name)
    data["call_counts"][name] = data["call_counts"].get(name, 0) + 1


def read_text_file(path):
    try:
        with open(path, "r", encoding="utf-8") as file:
            return file.read(), None
    except (OSError, UnicodeError) as error:
        return None, error


for path in file_paths:
    if path == ${JSON.stringify(PROJECT_VALIDATOR_PATH)}:
        continue

    source, read_error = read_text_file(path)
    if read_error is not None:
        syntax_errors[path] = f"Dosya okunamadı: {read_error}"
        continue

    sources[path] = source
    data = empty_data()
    file_data[path] = data

    if not path.endswith(".py"):
        continue

    try:
        tree = ast.parse(source, filename=path, mode="exec")
        trees[path] = tree
    except SyntaxError as error:
        syntax_errors[path] = f"{error.msg} (satır {error.lineno or 0})"
        continue

    for node in ast.walk(tree):
        node_name = type(node).__name__
        data["node_counts"][node_name] = data["node_counts"].get(node_name, 0) + 1

        if isinstance(node, ast.Assign):
            for target in node.targets:
                collect_target(target, data["assigned"])
        elif isinstance(node, ast.AnnAssign):
            collect_target(node.target, data["assigned"])
        elif isinstance(node, ast.NamedExpr):
            collect_target(node.target, data["assigned"])
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                collect_call(node.func.id, data)
            elif isinstance(node.func, ast.Attribute):
                collect_call(node.func.attr, data)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            positional_count = len(node.args.posonlyargs) + len(node.args.args)
            keyword_only_count = len(node.args.kwonlyargs)
            variadic_count = int(node.args.vararg is not None) + int(node.args.kwarg is not None)
            default_count = len(node.args.defaults) + sum(
                1 for default in node.args.kw_defaults if default is not None
            )
            returns_value = any(
                isinstance(child, ast.Return) and child.value is not None
                for child in ast.walk(node)
            )
            data["functions"][node.name] = {
                "parameterCount": positional_count + keyword_only_count + variadic_count,
                "defaultCount": default_count,
                "returnsValue": returns_value,
            }
        elif isinstance(node, ast.Import):
            for alias in node.names:
                data["imports"].add((alias.name, None))
        elif isinstance(node, ast.ImportFrom):
            module = "." * node.level + (node.module or "")
            for alias in node.names:
                data["imports"].add((module, alias.name))


def selected_data(check):
    requested_file = check.get("file")
    if requested_file:
        return file_data.get(requested_file, empty_data())

    combined = empty_data()
    for data in file_data.values():
        combined["assigned"].update(data["assigned"])
        combined["called"].update(data["called"])
        combined["imports"].update(data["imports"])
        combined["functions"].update(data["functions"])
        for name, count in data["call_counts"].items():
            combined["call_counts"][name] = combined["call_counts"].get(name, 0) + count
        for name, count in data["node_counts"].items():
            combined["node_counts"][name] = combined["node_counts"].get(name, 0) + count
    return combined


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


def check_result(check, passed, message):
    return {
        "id": check["id"],
        "label": check["label"],
        "visibility": check["visibility"],
        "passed": bool(passed),
        "message": message,
    }


def count_message(label, count, minimum, maximum):
    if maximum is not None and minimum == maximum:
        return f"{label} tam {minimum} kez bulunmalı; bulunan: {count}."
    if maximum is not None:
        return f"{label} {minimum} ile {maximum} kez bulunmalı; bulunan: {count}."
    return f"{label} en az {minimum} kez bulunmalı; bulunan: {count}."


def regex_flags(flags_text):
    flags = 0
    if "i" in flags_text:
        flags |= re.IGNORECASE
    if "m" in flags_text:
        flags |= re.MULTILINE
    if "s" in flags_text:
        flags |= re.DOTALL
    return flags


for check in spec.get("checks", []):
    kind = check.get("kind")
    data = selected_data(check)

    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        results.append(check_result(check, False, f"{path} sözdizimi hatası: {error}"))
        continue

    if kind == "file_exists":
        path = check["path"]
        passed = os.path.isfile(path)
        message = f"{path} proje içinde bulundu." if passed else f"{path} dosyası bulunamadı."
    elif kind == "file_content_regex":
        path = check["path"]
        content, error = read_text_file(path)
        passed = error is None and re.search(
            check["pattern"], content or "", regex_flags(check.get("flags", ""))
        ) is not None
        message = (
            f"{path} beklenen metin içeriğini taşıyor."
            if passed
            else f"{path} içeriği beklenen biçimle eşleşmedi."
        )
    elif kind == "json_file_equals":
        path = check["path"]
        try:
            with open(path, "r", encoding="utf-8") as file:
                actual = json.load(file)
            expected = check.get("expected")
            passed = actual == expected
            message = (
                f"{path} beklenen JSON verisini içeriyor."
                if passed
                else f"{path} JSON yapısı beklenen veriyle eşleşmedi."
            )
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            passed = False
            message = f"{path} geçerli JSON olarak okunamadı: {type(error).__name__}."
    elif kind == "file_unchanged":
        path = check["path"]
        content, error = read_text_file(path)
        passed = error is None and path in sources and content == sources[path]
        message = (
            f"{path} kaynak dosyası değiştirilmedi."
            if passed
            else f"{path} kaynak dosyası değiştirilmemelidir."
        )
    elif kind == "import_statement":
        module = check["module"]
        name = check.get("name")
        passed = (module, name) in data["imports"] or (
            name is None
            and any(imported_module == module for imported_module, _ in data["imports"])
        )
        target = f"{module}.{name}" if name else module
        message = f"{target} import edildi." if passed else f"{target} import ifadesi bulunamadı."
    elif kind == "assignment":
        name = check["name"]
        passed = name in data["assigned"]
        message = f"{name} değişkeni bulundu." if passed else f"{name} değişkeni tanımlanmadı."
    elif kind == "call":
        name = check["name"]
        passed = name in data["called"]
        message = f"{name}() çağrısı bulundu." if passed else f"{name}() kullanılmadı."
    elif kind == "call_count":
        name = check["name"]
        minimum = int(check.get("min", 0))
        maximum = check.get("max")
        maximum = int(maximum) if maximum is not None else None
        count = data["call_counts"].get(name, 0)
        passed = count >= minimum and (maximum is None or count <= maximum)
        message = (
            f"{name}() çağrı sayısı doğru: {count}."
            if passed
            else count_message(f"{name}()", count, minimum, maximum)
        )
    elif kind == "node_count":
        node_name = check["nodeName"]
        minimum = int(check.get("min", 0))
        maximum = check.get("max")
        maximum = int(maximum) if maximum is not None else None
        count = data["node_counts"].get(node_name, 0)
        passed = count >= minimum and (maximum is None or count <= maximum)
        message = (
            f"{node_name} yapısı bulundu: {count}."
            if passed
            else count_message(node_name, count, minimum, maximum)
        )
    elif kind == "function_definition":
        name = check["name"]
        definition = data["functions"].get(name)
        minimum_params = int(check.get("minParams", 0))
        maximum_params = check.get("maxParams")
        maximum_params = int(maximum_params) if maximum_params is not None else None
        minimum_defaults = int(check.get("minDefaults", 0))
        maximum_defaults = check.get("maxDefaults")
        maximum_defaults = int(maximum_defaults) if maximum_defaults is not None else None
        require_return = bool(check.get("requireReturn", False))

        if definition is None:
            passed = False
            message = f"{name} adlı fonksiyon tanımlanmadı."
        else:
            parameter_count = definition["parameterCount"]
            default_count = definition["defaultCount"]
            parameter_ok = parameter_count >= minimum_params and (
                maximum_params is None or parameter_count <= maximum_params
            )
            default_ok = default_count >= minimum_defaults and (
                maximum_defaults is None or default_count <= maximum_defaults
            )
            return_ok = not require_return or definition["returnsValue"]
            passed = parameter_ok and default_ok and return_ok
            message = f"{name}() imzası doğru."
            if not parameter_ok:
                message = count_message(
                    f"{name}() parametre sayısı", parameter_count, minimum_params, maximum_params
                )
            elif not default_ok:
                message = count_message(
                    f"{name}() varsayılan parametre sayısı", default_count, minimum_defaults, maximum_defaults
                )
            elif not return_ok:
                message = f"{name}() fonksiyonu bir değer return etmelidir."
    elif runtime_error is not None:
        passed = False
        message = "Proje çalışırken bir Python hatası oluştu."
    elif kind == "function_cases":
        name = check["name"]
        module_name = check.get("module")
        try:
            target_namespace = importlib.import_module(module_name).__dict__ if module_name else namespace
            function = target_namespace.get(name)
        except BaseException:
            function = None
        cases = check.get("cases", [])
        passed = callable(function) and len(cases) > 0
        message = f"{name}() gizli çağrı testleri geçti."

        if not callable(function):
            passed = False
            message = f"{name} çalıştırılabilir bir fonksiyon değil."
        elif not cases:
            passed = False
            message = "Fonksiyon için gizli çağrı senaryosu tanımlanmamış."
        else:
            for index, case in enumerate(cases, start=1):
                try:
                    case_stdout = io.StringIO()
                    case_stderr = io.StringIO()
                    with contextlib.redirect_stdout(case_stdout), contextlib.redirect_stderr(case_stderr):
                        actual = function(*case.get("args", []))
                except BaseException as error:
                    passed = False
                    message = f"Gizli senaryo {index} hata verdi: {type(error).__name__}."
                    break

                expected = case.get("expected")
                if actual != expected:
                    passed = False
                    message = (
                        f"Gizli senaryo {index} beklenen değeri döndürmedi "
                        f"(beklenen: {expected!r}, dönen: {actual!r})."
                    )
                    break
    elif kind == "variable_type":
        name = check["name"]
        expected_type = check["expectedType"]
        value = namespace.get(name)
        passed = name in namespace and type(value).__name__ == expected_type
        message = "Değişken türü doğru." if passed else "Değişken beklenen türde değil."
    elif kind == "variable_non_empty":
        name = check["name"]
        value = namespace.get(name)
        passed = name in namespace and bool(value)
        message = "Değişken boş değil." if passed else "Değişken boş bırakılamaz."
    elif kind == "variable_positive":
        name = check["name"]
        value = namespace.get(name)
        passed = (
            name in namespace
            and isinstance(value, (int, float))
            and not isinstance(value, bool)
            and value > 0
        )
        message = "Sayısal değer pozitif." if passed else "Değer sıfırdan büyük olmalı."
    elif kind == "stdout_regex":
        passed = re.search(
            check["pattern"], stdout, regex_flags(check.get("flags", ""))
        ) is not None
        message = (
            "Program çıktısı beklenen biçimde."
            if passed
            else "Program çıktısı beklenen biçimle eşleşmedi."
        )
    else:
        passed = False
        message = f"Desteklenmeyen kontrol türü: {kind}"

    results.append(check_result(check, passed, message))

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
  return `project-validation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function validateProjectTask(options: {
  files: RuntimeSourceFile[];
  entrypoint: string;
  stdin: string[];
  spec: TaskValidationSpec;
}) {
  const validatorFile = { path: PROJECT_VALIDATOR_PATH, content: PROJECT_VALIDATOR_SOURCE };
  const projectFiles = [validatorFile, ...options.files];
  const response = await runtimeClient.send<ExecuteCodeResult>({
    requestId: createRequestId(),
    protocolVersion: runtimeProtocolVersion,
    kind: "execute_code",
    payload: {
      source: PROJECT_VALIDATOR_SOURCE,
      filename: PROJECT_VALIDATOR_PATH,
      files: projectFiles,
      entrypoint: PROJECT_VALIDATOR_PATH,
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
    throw new Error("Proje doğrulama motoru sonuç verisi döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(diagnostic || runtimeMessage || "Proje doğrulama motoru çalıştırılamadı.");
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
