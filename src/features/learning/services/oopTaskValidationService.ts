import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeSourceFile,
} from "../../../runtime/runtimeProtocol";
import type { TaskValidationSpec } from "../taskValidationTypes";
import { parseTaskValidationOutput } from "./taskValidationService";

const VALIDATOR_PATH = "__python_farming_oop_validator__.py";

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

file_data = {}
syntax_errors = {}


def empty_data():
    return {
        "called": set(),
        "call_counts": {},
        "node_counts": {},
        "imports": set(),
        "classes": {},
    }


def dotted_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return None


def decorator_name(node):
    return dotted_name(node.func) if isinstance(node, ast.Call) else dotted_name(node)


def self_attribute(target):
    if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name):
        if target.value.id in {"self", "cls"}:
            return target.attr
    return None


def collect_self_targets(target, attributes):
    name = self_attribute(target)
    if name:
        attributes.add(name)
    elif isinstance(target, (ast.Tuple, ast.List)):
        for element in target.elts:
            collect_self_targets(element, attributes)


def method_definition(node):
    positional = list(node.args.posonlyargs) + list(node.args.args)
    if positional and positional[0].arg in {"self", "cls"}:
        positional = positional[1:]
    parameter_count = (
        len(positional)
        + len(node.args.kwonlyargs)
        + int(node.args.vararg is not None)
        + int(node.args.kwarg is not None)
    )
    default_count = len(node.args.defaults) + sum(
        1 for default in node.args.kw_defaults if default is not None
    )
    returns_value = any(
        isinstance(child, ast.Return) and child.value is not None
        for child in ast.walk(node)
    )
    return {
        "parameterCount": parameter_count,
        "defaultCount": default_count,
        "returnsValue": returns_value,
    }


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
        elif isinstance(node, ast.Import):
            for alias in node.names:
                data["imports"].add((alias.name, None))
        elif isinstance(node, ast.ImportFrom):
            module = "." * node.level + (node.module or "")
            for alias in node.names:
                data["imports"].add((module, alias.name))

    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue

        class_info = {
            "methods": {},
            "properties": set(),
            "setters": set(),
            "attributes": set(),
            "initParameterCount": 0,
        }

        for child in node.body:
            if not isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue

            class_info["methods"][child.name] = method_definition(child)
            if child.name == "__init__":
                class_info["initParameterCount"] = class_info["methods"][child.name]["parameterCount"]

            decorators = [name for decorator in child.decorator_list if (name := decorator_name(decorator))]
            if "property" in decorators:
                class_info["properties"].add(child.name)
            for decorator in decorators:
                if decorator.endswith(".setter"):
                    class_info["setters"].add(decorator.rsplit(".", 1)[0])

            for method_node in ast.walk(child):
                if isinstance(method_node, ast.Assign):
                    for target in method_node.targets:
                        collect_self_targets(target, class_info["attributes"])
                elif isinstance(method_node, ast.AnnAssign):
                    collect_self_targets(method_node.target, class_info["attributes"])
                elif isinstance(method_node, ast.AugAssign):
                    collect_self_targets(method_node.target, class_info["attributes"])
                elif isinstance(method_node, ast.NamedExpr):
                    collect_self_targets(method_node.target, class_info["attributes"])

        data["classes"][node.name] = class_info


def selected_data(check):
    requested_file = check.get("file")
    if requested_file:
        return file_data.get(requested_file, empty_data())

    combined = empty_data()
    for data in file_data.values():
        combined["called"].update(data["called"])
        combined["imports"].update(data["imports"])
        combined["classes"].update(data["classes"])
        for name, count in data["call_counts"].items():
            combined["call_counts"][name] = combined["call_counts"].get(name, 0) + count
        for name, count in data["node_counts"].items():
            combined["node_counts"][name] = combined["node_counts"].get(name, 0) + count
    return combined


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


def exception_matches(error, expected):
    if error is None:
        return False
    names = {klass.__name__ for klass in type(error).__mro__}
    return expected in names or any(expected.endswith(f".{name}") for name in names)


def resolve_class(check, namespace):
    module_name = check.get("module")
    try:
        target_namespace = importlib.import_module(module_name).__dict__ if module_name else namespace
        candidate = target_namespace.get(check["name"])
        return candidate if isinstance(candidate, type) else None
    except BaseException:
        return None


def observe(instance, observation):
    kind = observation.get("kind")
    if kind == "attribute":
        return getattr(instance, observation["name"])
    if kind == "method":
        method = getattr(instance, observation["name"])
        return method(*observation.get("args", []))
    if kind == "repr":
        return repr(instance)
    raise ValueError(f"Desteklenmeyen nesne gözlemi: {kind}")


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


for check in spec.get("checks", []):
    kind = check.get("kind")
    data = selected_data(check)

    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        results.append(check_result(check, False, f"{path} sözdizimi hatası: {error}"))
        continue

    if kind == "class_definition":
        info = data["classes"].get(check["name"])
        minimum = int(check.get("minInitParams", 0))
        maximum_value = check.get("maxInitParams")
        maximum = int(maximum_value) if maximum_value is not None else None
        required_methods = set(check.get("requiredMethods", []))
        required_properties = set(check.get("requiredProperties", []))
        required_setters = set(check.get("requiredSetters", []))
        required_attributes = set(check.get("requiredAttributes", []))

        if info is None:
            passed = False
            message = f"{check['name']} sınıfı tanımlanmadı."
        else:
            missing_methods = sorted(required_methods - set(info["methods"]))
            missing_properties = sorted(required_properties - info["properties"])
            missing_setters = sorted(required_setters - info["setters"])
            missing_attributes = sorted(required_attributes - info["attributes"])
            init_ok = count_ok(info["initParameterCount"], minimum, maximum)
            passed = (
                init_ok
                and not missing_methods
                and not missing_properties
                and not missing_setters
                and not missing_attributes
            )
            if not init_ok:
                message = (
                    f"{check['name']}.__init__ parametre sayısı uygun değil: "
                    f"{info['initParameterCount']}."
                )
            elif missing_methods:
                message = f"Eksik metotlar: {', '.join(missing_methods)}."
            elif missing_properties:
                message = f"Eksik property alanları: {', '.join(missing_properties)}."
            elif missing_setters:
                message = f"Eksik property setter alanları: {', '.join(missing_setters)}."
            elif missing_attributes:
                message = f"Eksik instance attribute alanları: {', '.join(missing_attributes)}."
            else:
                message = f"{check['name']} sınıf yapısı doğru."
    elif runtime_error is not None:
        passed = False
        message = "Proje çalışırken yakalanmamış bir Python hatası oluştu."
    elif kind == "class_cases":
        target_class = resolve_class(check, namespace)
        cases = check.get("cases", [])
        passed = target_class is not None and bool(cases)
        message = f"{check['name']} gizli nesne senaryoları geçti."

        if target_class is None:
            passed = False
            message = f"{check['name']} çalıştırılabilir bir sınıf değil."
        elif not cases:
            passed = False
            message = "Sınıf için gizli nesne senaryosu tanımlanmamış."
        else:
            for index, case in enumerate(cases, start=1):
                actual = None
                caught = None
                try:
                    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                        instance = target_class(*case.get("initArgs", []))
                        for action in case.get("actions", []):
                            if action.get("kind") == "call":
                                getattr(instance, action["name"])(*action.get("args", []))
                            elif action.get("kind") == "setattr":
                                setattr(instance, action["name"], action.get("value"))
                            else:
                                raise ValueError(f"Desteklenmeyen nesne eylemi: {action.get('kind')}")
                        actual = observe(instance, case["observe"])
                except BaseException as error:
                    caught = error

                expected_exception = case.get("exception")
                if expected_exception:
                    exception_ok = exception_matches(caught, expected_exception)
                    message_pattern = case.get("messagePattern")
                    message_ok = (
                        caught is not None
                        and (
                            not message_pattern
                            or re.search(message_pattern, str(caught), re.IGNORECASE) is not None
                        )
                    )
                    if not exception_ok or not message_ok:
                        passed = False
                        actual_name = type(caught).__name__ if caught is not None else "hata yok"
                        message = (
                            f"Gizli nesne senaryosu {index} {expected_exception} bekliyordu; "
                            f"alınan: {actual_name}."
                        )
                        break
                elif caught is not None:
                    passed = False
                    message = f"Gizli nesne senaryosu {index} hata verdi: {type(caught).__name__}."
                    break
                elif actual != case.get("expected"):
                    passed = False
                    message = (
                        f"Gizli nesne senaryosu {index} beklenen sonucu vermedi "
                        f"(beklenen: {case.get('expected')!r}, dönen: {actual!r})."
                    )
                    break
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
    elif kind == "file_exists":
        passed = os.path.isfile(check["path"])
        message = "Beklenen dosya bulundu." if passed else "Beklenen dosya bulunamadı."
    elif kind == "stdout_regex":
        passed = re.search(check["pattern"], stdout, regex_flags(check.get("flags", ""))) is not None
        message = "Program çıktısı beklenen biçimde." if passed else "Program çıktısı eşleşmedi."
    else:
        passed = False
        message = f"OOP doğrulayıcısında desteklenmeyen kontrol türü: {kind}"

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
  return `oop-validation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function validateOopTask(options: {
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
    throw new Error("OOP doğrulama motoru sonuç verisi döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(diagnostic || runtimeMessage || "OOP doğrulama motoru çalıştırılamadı.");
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
