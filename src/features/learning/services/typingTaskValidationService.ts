import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeSourceFile,
} from "../../../runtime/runtimeProtocol";
import type { TaskValidationSpec } from "../taskValidationTypes";
import { parseTaskValidationOutput } from "./taskValidationService";

const VALIDATOR_PATH = "__python_farming_typing_validator__.py";

const VALIDATOR_SOURCE = String.raw`
import ast
import contextlib
import dataclasses
import importlib
import io
import json
import os
import re
import runpy
import sys
import time
import traceback
import typing

payload = json.loads(sys.stdin.read())
file_paths = payload["files"]
entrypoint = payload["entrypoint"]
stdin_lines = payload.get("stdin", [])
spec = payload["spec"]
started_at = time.perf_counter()
sys.dont_write_bytecode = True


def normalize(value):
    if value is None:
        return None
    if isinstance(value, ast.AST):
        try:
            value = ast.unparse(value)
        except BaseException:
            value = ""
    return re.sub(r"\s+", "", str(value)).replace("typing.", "")


def dotted_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return None


def decorator_name(node):
    return dotted_name(node.func) if isinstance(node, ast.Call) else dotted_name(node)


def function_info(node, remove_receiver=False):
    positional = list(node.args.posonlyargs) + list(node.args.args)
    if remove_receiver and positional and positional[0].arg in {"self", "cls"}:
        positional = positional[1:]
    parameters = {}
    for argument in positional + list(node.args.kwonlyargs):
        parameters[argument.arg] = normalize(argument.annotation)
    if node.args.vararg:
        parameters[node.args.vararg.arg] = normalize(node.args.vararg.annotation)
    if node.args.kwarg:
        parameters[node.args.kwarg.arg] = normalize(node.args.kwarg.annotation)
    return {"parameters": parameters, "return": normalize(node.returns)}


def dataclass_field_info(node):
    default_kind = "required"
    factory = None
    if node.value is not None:
        if isinstance(node.value, ast.Call) and (dotted_name(node.value.func) or "").split(".")[-1] == "field":
            default_kind = "value"
            for keyword in node.value.keywords:
                if keyword.arg == "default_factory":
                    default_kind = "factory"
                    factory = normalize(keyword.value)
                    break
        else:
            default_kind = "value"
    return {
        "annotation": normalize(node.annotation),
        "defaultKind": default_kind,
        "factory": factory,
    }


def empty_data():
    return {"functions": {}, "classes": {}}


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
            data["functions"][node.name] = function_info(node)
            continue
        if not isinstance(node, ast.ClassDef):
            continue

        decorators = [
            name for item in node.decorator_list
            if (name := decorator_name(item))
        ]
        dataclass_decorator = next(
            (
                item for item in node.decorator_list
                if (decorator_name(item) or "").split(".")[-1] == "dataclass"
            ),
            None,
        )
        frozen = False
        if isinstance(dataclass_decorator, ast.Call):
            for keyword in dataclass_decorator.keywords:
                if keyword.arg == "frozen" and isinstance(keyword.value, ast.Constant):
                    frozen = bool(keyword.value.value)

        info = {
            "bases": {(dotted_name(base) or "").split(".")[-1] for base in node.bases},
            "decorators": {name.split(".")[-1] for name in decorators},
            "dataclass": dataclass_decorator is not None,
            "frozen": frozen,
            "fields": {},
            "methods": {},
        }
        for child in node.body:
            if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name):
                info["fields"][child.target.id] = dataclass_field_info(child)
            elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                info["methods"][child.name] = function_info(child, remove_receiver=True)
        data["classes"][node.name] = info


def selected_data(check):
    requested = check.get("file")
    if requested:
        return file_data.get(requested, empty_data())
    combined = empty_data()
    for data in file_data.values():
        combined["functions"].update(data["functions"])
        combined["classes"].update(data["classes"])
    return combined


def accepted(actual, choices):
    return actual in {normalize(choice) for choice in choices}


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
    target_namespace = resolve_namespace(check, fallback)
    class_name = check.get("className")
    if class_name:
        owner = target_namespace.get(class_name)
        return getattr(owner, check["name"], None) if isinstance(owner, type) else None
    return target_namespace.get(check["name"])


def resolve_class(check, fallback):
    candidate = resolve_namespace(check, fallback).get(check["name"])
    return candidate if isinstance(candidate, type) else None


def exception_matches(error, expected):
    if error is None:
        return False
    names = {klass.__name__ for klass in type(error).__mro__}
    return expected in names or any(expected.endswith(f".{name}") for name in names)


def observe(instance, observation):
    if observation.get("kind") == "attribute":
        return getattr(instance, observation["name"])
    if observation.get("kind") == "method":
        return getattr(instance, observation["name"])(*observation.get("args", []))
    if observation.get("kind") == "repr":
        return repr(instance)
    raise ValueError("Desteklenmeyen nesne gözlemi")


def regex_flags(text):
    flags = 0
    if "i" in text:
        flags |= re.IGNORECASE
    if "m" in text:
        flags |= re.MULTILINE
    if "s" in text:
        flags |= re.DOTALL
    return flags


def item(check, passed, message):
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
    data = selected_data(check)
    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        results.append(item(check, False, f"{path} sözdizimi hatası: {error}"))
        continue

    if kind == "function_annotations":
        class_name = check.get("className")
        info = (
            data["classes"].get(class_name, {}).get("methods", {}).get(check["name"])
            if class_name else data["functions"].get(check["name"])
        )
        if info is None:
            results.append(item(check, False, f"{check['name']} fonksiyonu bulunamadı."))
            continue
        missing = []
        wrong = []
        for expected in check.get("parameters", []):
            actual = info["parameters"].get(expected["name"])
            if actual is None:
                missing.append(expected["name"])
            elif not accepted(actual, expected.get("accepted", [])):
                wrong.append(f"{expected['name']}={actual}")
        all_annotated = all(value is not None for value in info["parameters"].values())
        return_ok = accepted(info["return"], check.get("returnAccepted", []))
        resolved_ok = True
        try:
            target = resolve_function(check, namespace)
            if not callable(target):
                resolved_ok = False
            else:
                typing.get_type_hints(target)
        except BaseException:
            resolved_ok = False
        passed = (
            not missing and not wrong and return_ok and resolved_ok
            and (not check.get("requireAllParameters") or all_annotated)
        )
        if missing:
            message = f"Annotation eksik parametreler: {', '.join(missing)}."
        elif wrong:
            message = f"Beklenmeyen annotation: {', '.join(wrong)}."
        elif not return_ok:
            message = f"Dönüş annotation'ı uygun değil: {info['return']}."
        elif not resolved_ok:
            message = "Type hint ifadeleri çalışma zamanında çözümlenemedi."
        elif check.get("requireAllParameters") and not all_annotated:
            message = "Bütün parametreler annotation içermiyor."
        else:
            message = "Fonksiyon type hint sözleşmesi doğru."
        results.append(item(check, passed, message))

    elif kind == "dataclass_definition":
        info = data["classes"].get(check["name"])
        try:
            target = resolve_class(check, namespace)
        except BaseException:
            target = None
        runtime_dataclass = target is not None and dataclasses.is_dataclass(target)
        runtime_frozen = bool(
            runtime_dataclass
            and getattr(getattr(target, "__dataclass_params__", None), "frozen", False)
        )
        missing = []
        wrong = []
        if info:
            for expected in check.get("fields", []):
                field = info["fields"].get(expected["name"])
                if field is None:
                    missing.append(expected["name"])
                    continue
                if not accepted(field["annotation"], expected.get("accepted", [])):
                    wrong.append(f"{expected['name']} annotation")
                if expected.get("defaultKind") and field["defaultKind"] != expected["defaultKind"]:
                    wrong.append(f"{expected['name']} default")
                if expected.get("factory") and normalize(field["factory"]) != normalize(expected["factory"]):
                    wrong.append(f"{expected['name']} factory")
        missing_methods = sorted(
            set(check.get("requiredMethods", [])) - (set(info["methods"]) if info else set())
        )
        frozen_ok = check.get("frozen") is None or runtime_frozen == bool(check.get("frozen"))
        hints_ok = True
        try:
            if target is None:
                hints_ok = False
            else:
                typing.get_type_hints(target)
        except BaseException:
            hints_ok = False
        passed = bool(
            info and info["dataclass"] and runtime_dataclass
            and not missing and not wrong and not missing_methods
            and frozen_ok and hints_ok
        )
        if not info:
            message = f"{check['name']} sınıfı bulunamadı."
        elif not info["dataclass"] or not runtime_dataclass:
            message = f"{check['name']} gerçek bir dataclass değil."
        elif missing:
            message = f"Eksik dataclass alanları: {', '.join(missing)}."
        elif wrong:
            message = f"Dataclass alan sözleşmesi hatalı: {', '.join(wrong)}."
        elif missing_methods:
            message = f"Eksik metotlar: {', '.join(missing_methods)}."
        elif not frozen_ok:
            message = "Dataclass frozen ayarı beklenen değerde değil."
        elif not hints_ok:
            message = "Dataclass type hint ifadeleri çözümlenemedi."
        else:
            message = "Dataclass alan ve type hint sözleşmesi doğru."
        results.append(item(check, passed, message))

    elif kind == "protocol_definition":
        info = data["classes"].get(check["name"])
        try:
            target = resolve_class(check, namespace)
        except BaseException:
            target = None
        missing = []
        wrong = []
        if info:
            for expected_method in check.get("methods", []):
                method = info["methods"].get(expected_method["name"])
                if method is None:
                    missing.append(expected_method["name"])
                    continue
                for expected in expected_method.get("parameters", []):
                    actual = method["parameters"].get(expected["name"])
                    if actual is None or not accepted(actual, expected.get("accepted", [])):
                        wrong.append(f"{expected_method['name']}.{expected['name']}")
                choices = expected_method.get("returnAccepted")
                if choices and not accepted(method["return"], choices):
                    wrong.append(f"{expected_method['name']} dönüş")
        protocol_ok = bool(target is not None and getattr(target, "_is_protocol", False))
        runtime_ok = (
            check.get("runtimeCheckable") is None
            or bool(getattr(target, "_is_runtime_protocol", False)) == bool(check.get("runtimeCheckable"))
        )
        passed = bool(
            info and "Protocol" in info["bases"] and protocol_ok
            and runtime_ok and not missing and not wrong
        )
        if not info:
            message = f"{check['name']} protocol sınıfı bulunamadı."
        elif "Protocol" not in info["bases"] or not protocol_ok:
            message = f"{check['name']} typing.Protocol tabanından türemiyor."
        elif not runtime_ok:
            message = "Protocol runtime_checkable ayarı beklenen değerde değil."
        elif missing:
            message = f"Eksik protocol metotları: {', '.join(missing)}."
        elif wrong:
            message = f"Protocol annotation sözleşmesi hatalı: {', '.join(wrong)}."
        else:
            message = "Protocol arayüzü ve type hint sözleşmesi doğru."
        results.append(item(check, passed, message))

    elif runtime_error is not None:
        results.append(item(check, False, "Proje çalışırken yakalanmamış bir Python hatası oluştu."))

    elif kind == "function_cases":
        try:
            candidate = resolve_function(check, namespace)
        except BaseException:
            candidate = None
        failures = []
        if not callable(candidate):
            failures.append(f"{check['name']} çağrılabilir değil.")
        else:
            for index, case in enumerate(check.get("cases", []), start=1):
                try:
                    actual = candidate(*case.get("args", []))
                    if actual != case.get("expected"):
                        failures.append(f"Senaryo {index}: {actual!r} döndü.")
                except BaseException as error:
                    failures.append(f"Senaryo {index}: {type(error).__name__}: {error}")
        results.append(item(
            check,
            not failures,
            failures[0] if failures else f"{len(check.get('cases', []))} gizli fonksiyon senaryosu geçti.",
        ))

    elif kind == "class_cases":
        try:
            candidate = resolve_class(check, namespace)
        except BaseException:
            candidate = None
        failures = []
        if candidate is None:
            failures.append(f"{check['name']} sınıfı çağrılamadı.")
        else:
            for index, case in enumerate(check.get("cases", []), start=1):
                caught = None
                actual = None
                try:
                    instance = candidate(*case.get("initArgs", []))
                    for action in case.get("actions", []):
                        if action.get("kind") == "call":
                            getattr(instance, action["name"])(*action.get("args", []))
                        elif action.get("kind") == "setattr":
                            setattr(instance, action["name"], action.get("value"))
                    actual = observe(instance, case["observe"])
                except BaseException as error:
                    caught = error
                expected_exception = case.get("exception")
                if expected_exception:
                    passed_case = exception_matches(caught, expected_exception)
                    pattern = case.get("messagePattern")
                    if passed_case and pattern:
                        passed_case = re.search(pattern, str(caught), re.IGNORECASE) is not None
                else:
                    passed_case = caught is None and actual == case.get("expected")
                if not passed_case:
                    detail = f"{type(caught).__name__}: {caught}" if caught else repr(actual)
                    failures.append(f"Senaryo {index}: {detail}")
        results.append(item(
            check,
            not failures,
            failures[0] if failures else f"{len(check.get('cases', []))} gizli nesne senaryosu geçti.",
        ))

    elif kind == "stdout_regex":
        passed = re.search(check["pattern"], stdout, regex_flags(check.get("flags", ""))) is not None
        results.append(item(
            check,
            passed,
            "Terminal çıktısı beklenen biçimde." if passed else "Terminal çıktısı beklenen biçimle eşleşmedi.",
        ))

    else:
        results.append(item(check, False, f"Typing doğrulayıcısında desteklenmeyen kontrol türü: {kind}"))

passed_count = sum(1 for result in results if result["passed"])
total_count = len(results)
score = round((passed_count / total_count) * 100) if total_count else 0
print(json.dumps({
    "taskId": spec["id"],
    "passed": total_count > 0 and passed_count == total_count,
    "score": score,
    "checks": results,
    "stdout": stdout,
    "stderr": stderr,
    "runtimeError": runtime_error,
    "durationMs": round((time.perf_counter() - started_at) * 1000),
}, ensure_ascii=False))
`;

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `typing-validation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function validateTypingTask(options: {
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
    throw new Error("Typing doğrulama motoru sonuç verisi döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(diagnostic || runtimeMessage || "Typing doğrulama motoru çalıştırılamadı.");
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
