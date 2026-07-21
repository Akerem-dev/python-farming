import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeSourceFile,
} from "../../../runtime/runtimeProtocol";
import type { TaskValidationSpec } from "../taskValidationTypes";
import { parseTaskValidationOutput } from "./taskValidationService";

const VALIDATOR_PATH = "__python_farming_exception_validator__.py";

const VALIDATOR_SOURCE = String.raw`
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
file_data = {}
syntax_errors = {}


def empty_data():
    return {
        "called": set(),
        "call_counts": {},
        "node_counts": {},
        "functions": {},
        "imports": set(),
        "handlers": [],
        "tryCount": 0,
        "elseCount": 0,
        "finallyCount": 0,
        "exceptionClasses": {},
        "raised": {},
    }


def dotted_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return None


def exception_names(node):
    if node is None:
        return [None]
    if isinstance(node, ast.Tuple):
        names = []
        for element in node.elts:
            names.extend(exception_names(element))
        return names
    name = dotted_name(node)
    return [name] if name else []


def raised_name(node):
    if node is None:
        return None
    if isinstance(node, ast.Call):
        return dotted_name(node.func)
    return dotted_name(node)


def matches_exception(actual, expected):
    if actual is None:
        return False
    return actual == expected or actual.endswith(f".{expected}") or expected.endswith(f".{actual}")


def read_text(path):
    try:
        with open(path, "r", encoding="utf-8") as source_file:
            return source_file.read(), None
    except (OSError, UnicodeError) as error:
        return None, error


for path in file_paths:
    if path == ${JSON.stringify(VALIDATOR_PATH)}:
        continue

    source, read_error = read_text(path)
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
    except SyntaxError as error:
        syntax_errors[path] = f"{error.msg} (satır {error.lineno or 0})"
        continue

    for node in ast.walk(tree):
        node_name = type(node).__name__
        data["node_counts"][node_name] = data["node_counts"].get(node_name, 0) + 1

        if isinstance(node, ast.Call):
            call_name = dotted_name(node.func)
            if call_name:
                leaf_name = call_name.split(".")[-1]
                data["called"].add(leaf_name)
                data["call_counts"][leaf_name] = data["call_counts"].get(leaf_name, 0) + 1
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
        elif isinstance(node, ast.Try):
            data["tryCount"] += 1
            if node.orelse:
                data["elseCount"] += 1
            if node.finalbody:
                data["finallyCount"] += 1
            for handler in node.handlers:
                data["handlers"].extend(exception_names(handler.type))
        elif isinstance(node, ast.ClassDef):
            bases = [name for base in node.bases if (name := dotted_name(base))]
            data["exceptionClasses"][node.name] = bases
        elif isinstance(node, ast.Raise):
            name = raised_name(node.exc)
            if name:
                leaf_name = name.split(".")[-1]
                data["raised"][leaf_name] = data["raised"].get(leaf_name, 0) + 1


def selected_data(check):
    requested_file = check.get("file")
    if requested_file:
        return file_data.get(requested_file, empty_data())

    combined = empty_data()
    for data in file_data.values():
        combined["called"].update(data["called"])
        combined["functions"].update(data["functions"])
        combined["imports"].update(data["imports"])
        combined["handlers"].extend(data["handlers"])
        combined["tryCount"] += data["tryCount"]
        combined["elseCount"] += data["elseCount"]
        combined["finallyCount"] += data["finallyCount"]
        combined["exceptionClasses"].update(data["exceptionClasses"])
        for name, count in data["call_counts"].items():
            combined["call_counts"][name] = combined["call_counts"].get(name, 0) + count
        for name, count in data["node_counts"].items():
            combined["node_counts"][name] = combined["node_counts"].get(name, 0) + count
        for name, count in data["raised"].items():
            combined["raised"][name] = combined["raised"].get(name, 0) + count
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


def count_ok(count, minimum, maximum):
    return count >= minimum and (maximum is None or count <= maximum)


def regex_flags(flags_text):
    flags = 0
    if "i" in flags_text:
        flags |= re.IGNORECASE
    if "m" in flags_text:
        flags |= re.MULTILINE
    if "s" in flags_text:
        flags |= re.DOTALL
    return flags


def resolve_function(check):
    module_name = check.get("module")
    try:
        target_namespace = importlib.import_module(module_name).__dict__ if module_name else namespace
        return target_namespace.get(check["name"])
    except BaseException:
        return None


for check in spec.get("checks", []):
    kind = check.get("kind")
    data = selected_data(check)

    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        results.append(check_result(check, False, f"{path} sözdizimi hatası: {error}"))
        continue

    if kind == "exception_handling":
        handlers = data["handlers"]
        minimum = int(check.get("minHandlers", 0))
        maximum_value = check.get("maxHandlers")
        maximum = int(maximum_value) if maximum_value is not None else None
        required_types = check.get("requiredTypes", [])
        missing = [
            required
            for required in required_types
            if not any(matches_exception(actual, required) for actual in handlers)
        ]
        bare_count = sum(1 for handler in handlers if handler is None)
        passed = (
            data["tryCount"] > 0
            and count_ok(len(handlers), minimum, maximum)
            and not missing
            and (not check.get("requireElse", False) or data["elseCount"] > 0)
            and (not check.get("requireFinally", False) or data["finallyCount"] > 0)
            and (not check.get("disallowBareExcept", False) or bare_count == 0)
        )
        if passed:
            message = "Hata yakalama yapısı beklenen türler ve bloklarla kuruldu."
        elif missing:
            message = f"Eksik except türleri: {', '.join(missing)}."
        elif check.get("disallowBareExcept", False) and bare_count > 0:
            message = "Çıplak except: kullanılmamalıdır."
        elif check.get("requireElse", False) and data["elseCount"] == 0:
            message = "try yapısında else bloğu bulunmalıdır."
        elif check.get("requireFinally", False) and data["finallyCount"] == 0:
            message = "try yapısında finally bloğu bulunmalıdır."
        else:
            message = f"Except sayısı beklenen aralıkta değil: {len(handlers)}."
    elif kind == "exception_class":
        bases = data["exceptionClasses"].get(check["name"], [])
        expected_base = check["base"]
        passed = any(matches_exception(base, expected_base) for base in bases)
        message = (
            f"{check['name']} özel hata sınıfı {expected_base} tabanından türetiliyor."
            if passed
            else f"{check['name']} sınıfı {expected_base} tabanından türetilmelidir."
        )
    elif kind == "raise_exception":
        name = check["name"]
        count = data["raised"].get(name, 0)
        minimum = int(check.get("min", 0))
        maximum_value = check.get("max")
        maximum = int(maximum_value) if maximum_value is not None else None
        passed = count_ok(count, minimum, maximum)
        message = (
            f"{name} beklenen sayıda raise edildi: {count}."
            if passed
            else f"{name} raise sayısı uygun değil: {count}."
        )
    elif kind == "function_definition":
        definition = data["functions"].get(check["name"])
        minimum_params = int(check.get("minParams", 0))
        maximum_value = check.get("maxParams")
        maximum_params = int(maximum_value) if maximum_value is not None else None
        minimum_defaults = int(check.get("minDefaults", 0))
        maximum_default_value = check.get("maxDefaults")
        maximum_defaults = int(maximum_default_value) if maximum_default_value is not None else None
        passed = definition is not None
        if definition is not None:
            passed = (
                count_ok(definition["parameterCount"], minimum_params, maximum_params)
                and count_ok(definition["defaultCount"], minimum_defaults, maximum_defaults)
                and (not check.get("requireReturn", False) or definition["returnsValue"])
            )
        message = (
            f"{check['name']}() imzası doğru."
            if passed
            else f"{check['name']}() fonksiyon imzası beklenen biçimde değil."
        )
    elif runtime_error is not None:
        passed = False
        message = "Proje çalışırken yakalanmamış bir Python hatası oluştu."
    elif kind == "function_cases":
        function = resolve_function(check)
        cases = check.get("cases", [])
        passed = callable(function) and bool(cases)
        message = f"{check['name']}() gizli çağrı testleri geçti."
        if not callable(function):
            passed = False
            message = f"{check['name']} çalıştırılabilir bir fonksiyon değil."
        else:
            for index, case in enumerate(cases, start=1):
                try:
                    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                        actual = function(*case.get("args", []))
                except BaseException as error:
                    passed = False
                    message = f"Gizli senaryo {index} hata verdi: {type(error).__name__}."
                    break
                if actual != case.get("expected"):
                    passed = False
                    message = f"Gizli senaryo {index} beklenen değeri döndürmedi."
                    break
    elif kind == "function_raises":
        function = resolve_function(check)
        cases = check.get("cases", [])
        passed = callable(function) and bool(cases)
        message = f"{check['name']}() beklenen hataları doğru biçimde fırlattı."
        if not callable(function):
            passed = False
            message = f"{check['name']} çalıştırılabilir bir fonksiyon değil."
        else:
            for index, case in enumerate(cases, start=1):
                try:
                    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                        function(*case.get("args", []))
                except BaseException as error:
                    expected_name = case.get("exception")
                    expected_pattern = case.get("messagePattern")
                    if type(error).__name__ != expected_name:
                        passed = False
                        message = (
                            f"Gizli senaryo {index} {expected_name} yerine "
                            f"{type(error).__name__} fırlattı."
                        )
                        break
                    if expected_pattern and re.search(expected_pattern, str(error)) is None:
                        passed = False
                        message = f"Gizli senaryo {index} hata mesajı beklenen biçimde değil."
                        break
                else:
                    passed = False
                    message = f"Gizli senaryo {index} beklenen hatayı fırlatmadı."
                    break
    elif kind == "file_exists":
        path = check["path"]
        passed = os.path.isfile(path)
        message = f"{path} dosyası bulundu." if passed else f"{path} dosyası bulunamadı."
    elif kind == "file_content_regex":
        path = check["path"]
        content, error = read_text(path)
        passed = error is None and re.search(
            check["pattern"], content or "", regex_flags(check.get("flags", ""))
        ) is not None
        message = (
            f"{path} beklenen içeriği taşıyor."
            if passed
            else f"{path} içeriği beklenen biçimde değil."
        )
    elif kind == "json_file_equals":
        path = check["path"]
        try:
            with open(path, "r", encoding="utf-8") as json_file:
                actual = json.load(json_file)
            passed = actual == check.get("expected")
        except (OSError, UnicodeError, json.JSONDecodeError):
            passed = False
        message = (
            f"{path} beklenen JSON verisini içeriyor."
            if passed
            else f"{path} JSON çıktısı beklenen yapıyla eşleşmedi."
        )
    elif kind == "file_unchanged":
        path = check["path"]
        content, error = read_text(path)
        passed = error is None and path in sources and content == sources[path]
        message = (
            f"{path} kaynak dosyası korunmuş."
            if passed
            else f"{path} kaynak dosyası değiştirilmemelidir."
        )
    elif kind == "import_statement":
        module = check["module"]
        name = check.get("name")
        passed = (module, name) in data["imports"] or (
            name is None and any(imported_module == module for imported_module, _ in data["imports"])
        )
        message = "Import ifadesi bulundu." if passed else "Beklenen import ifadesi bulunamadı."
    elif kind == "node_count":
        count = data["node_counts"].get(check["nodeName"], 0)
        maximum_value = check.get("max")
        maximum = int(maximum_value) if maximum_value is not None else None
        passed = count_ok(count, int(check.get("min", 0)), maximum)
        message = (
            f"{check['nodeName']} yapısı bulundu: {count}."
            if passed
            else f"{check['nodeName']} yapısı beklenen sayıda değil: {count}."
        )
    elif kind == "call":
        passed = check["name"] in data["called"]
        message = "Beklenen çağrı bulundu." if passed else "Beklenen çağrı bulunamadı."
    elif kind == "call_count":
        count = data["call_counts"].get(check["name"], 0)
        maximum_value = check.get("max")
        maximum = int(maximum_value) if maximum_value is not None else None
        passed = count_ok(count, int(check.get("min", 0)), maximum)
        message = "Çağrı sayısı doğru." if passed else f"Çağrı sayısı uygun değil: {count}."
    elif kind == "stdout_regex":
        passed = re.search(
            check["pattern"], stdout, regex_flags(check.get("flags", ""))
        ) is not None
        message = "Program çıktısı beklenen biçimde." if passed else "Program çıktısı eşleşmedi."
    else:
        passed = False
        message = f"Exception doğrulayıcısında desteklenmeyen kontrol türü: {kind}"

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
  return `exception-validation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function validateExceptionTask(options: {
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
    throw new Error("Exception doğrulama motoru sonuç verisi döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(diagnostic || runtimeMessage || "Exception doğrulama motoru çalıştırılamadı.");
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
