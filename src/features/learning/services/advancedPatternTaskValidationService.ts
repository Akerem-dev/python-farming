import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeSourceFile,
} from "../../../runtime/runtimeProtocol";
import type { TaskValidationSpec } from "../taskValidationTypes";
import { parseTaskValidationOutput } from "./taskValidationService";

const VALIDATOR_PATH = "__python_farming_advanced_patterns_validator__.py";

const VALIDATOR_SOURCE = String.raw`
import ast
import contextlib
import importlib
import inspect
import io
import json
import os
import re
import runpy
import sys
import time
import traceback
from decimal import Decimal

payload = json.loads(sys.stdin.read())
file_paths = payload["files"]
entrypoint = payload["entrypoint"]
stdin_lines = payload.get("stdin", [])
spec = payload["spec"]
started_at = time.perf_counter()
sys.dont_write_bytecode = True

sources = {}
trees = {}
syntax_errors = {}
for path in file_paths:
    if path == ${JSON.stringify(VALIDATOR_PATH)}:
        continue
    try:
        sources[path] = open(path, "r", encoding="utf-8").read()
    except (OSError, UnicodeError) as error:
        syntax_errors[path] = f"Dosya okunamadı: {error}"
        continue
    if not path.endswith(".py"):
        continue
    try:
        trees[path] = ast.parse(sources[path], filename=path, mode="exec")
    except SyntaxError as error:
        syntax_errors[path] = f"{error.msg} (satır {error.lineno or 0})"


def item(check, passed, message):
    return {
        "id": check["id"],
        "label": check["label"],
        "visibility": check["visibility"],
        "passed": bool(passed),
        "message": message,
    }


def regex_flags(text):
    flags = 0
    if "i" in text:
        flags |= re.IGNORECASE
    if "m" in text:
        flags |= re.MULTILINE
    if "s" in text:
        flags |= re.DOTALL
    return flags


def normalize(value):
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, tuple):
        return [normalize(item) for item in value]
    if isinstance(value, list):
        return [normalize(item) for item in value]
    if isinstance(value, dict):
        return {str(key): normalize(item) for key, item in value.items()}
    return value


def dotted_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    if isinstance(node, ast.Call):
        return dotted_name(node.func)
    return None


def top_level_function(path, name):
    tree = trees.get(path)
    if tree is None:
        return None
    return next(
        (
            node for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name == name
        ),
        None,
    )


def top_level_class(path, name):
    tree = trees.get(path)
    if tree is None:
        return None
    return next(
        (
            node for node in tree.body
            if isinstance(node, ast.ClassDef) and node.name == name
        ),
        None,
    )


def nested_function_depth(node):
    def visit(current, depth):
        best = depth
        for child in getattr(current, "body", []):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                best = max(best, visit(child, depth + 1))
        return best
    return visit(node, 0)


def has_wraps(node):
    return any(
        isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
        and any((dotted_name(decorator) or "").split(".")[-1] == "wraps" for decorator in child.decorator_list)
        for child in ast.walk(node)
    )


def target_has_decorator(path, target_name, decorator_name):
    node = top_level_function(path, target_name)
    if node is None:
        return False
    return any(
        (dotted_name(decorator) or "").split(".")[-1] == decorator_name
        for decorator in node.decorator_list
    )


def resolve_namespace(module_name, fallback):
    return importlib.import_module(module_name).__dict__ if module_name else fallback


def run_callable_cases(target, cases):
    for index, case in enumerate(cases, start=1):
        output = io.StringIO()
        try:
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()):
                actual = target(*case.get("args", []), **case.get("kwargs", {}))
        except BaseException as error:
            return False, f"{index}. gizli çağrı hata verdi: {type(error).__name__}: {error}"
        if "expected" in case and normalize(actual) != case.get("expected"):
            return False, f"{index}. gizli çağrı beklenen sonucu döndürmedi: {actual!r}."
        pattern = case.get("outputPattern")
        if pattern and re.search(pattern, output.getvalue(), re.IGNORECASE | re.MULTILINE) is None:
            return False, f"{index}. gizli çağrı beklenen yan etki çıktısını üretmedi."
    return True, "Gizli davranış senaryoları geçti."


def check_decorator(check, namespace):
    path = check.get("file", entrypoint)
    node = top_level_function(path, check["name"])
    if node is None:
        return False, f"{path} içinde {check['name']} decorator fonksiyonu bulunamadı."

    depth = nested_function_depth(node)
    expected_depth = 2 if check.get("parameterized") else 1
    if depth < expected_depth:
        return False, "Decorator katmanları eksik veya yanlış iç içe geçmiş."

    if check.get("requireWraps") and not has_wraps(node):
        return False, "wrapper üzerinde functools.wraps kullanılmalı."

    for target_spec in check.get("targets", []):
        target_name = target_spec["name"]
        if not target_has_decorator(path, target_name, check["name"]):
            return False, f"{target_name} fonksiyonu @{check['name']} ile süslenmemiş."
        module_name = target_spec.get("module")
        target_namespace = resolve_namespace(module_name, namespace)
        target = target_namespace.get(target_name)
        if not callable(target):
            return False, f"{target_name} çalışma zamanında çağrılabilir değil."
        expected_name = target_spec.get("expectedName")
        if expected_name is not None and getattr(target, "__name__", None) != expected_name:
            return False, f"{target_name} metadata adı korunmadı."
        expected_doc = target_spec.get("expectedDoc")
        if expected_doc is not None and inspect.getdoc(target) != expected_doc:
            return False, f"{target_name} docstring metadata’sı korunmadı."
        ok, message = run_callable_cases(target, target_spec.get("cases", []))
        if not ok:
            return False, message

    return True, "Decorator yapısı, metadata ve gizli çağrılar doğru."


def check_context_manager(check, namespace):
    path = check.get("file", entrypoint)
    implementation = check.get("implementation")
    if implementation == "class":
        node = top_level_class(path, check["name"])
        if node is None:
            return False, f"{path} içinde {check['name']} sınıfı bulunamadı."
        methods = {
            child.name: child
            for child in node.body
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        if "__enter__" not in methods or "__exit__" not in methods:
            return False, "Sınıf context manager __enter__ ve __exit__ metotlarını içermeli."
        if check.get("enterReturnsSelf"):
            returns_self = any(
                isinstance(child, ast.Return)
                and isinstance(child.value, ast.Name)
                and child.value.id == "self"
                for child in ast.walk(methods["__enter__"])
            )
            if not returns_self:
                return False, "__enter__ self döndürmeli."
        if check.get("exitSuppresses") is False:
            target_namespace = resolve_namespace(check.get("module"), namespace)
            owner = target_namespace.get(check["name"])
            if not isinstance(owner, type):
                return False, "Context manager sınıfı çalışma zamanında çözümlenemedi."
            try:
                instance = owner(*check.get("initArgs", []))
                result = instance.__exit__(None, None, None)
            except BaseException as error:
                return False, f"__exit__ gizli kontrolde hata verdi: {type(error).__name__}: {error}"
            if result not in (None, False):
                return False, "__exit__ hataları bastırmamalı."
    elif implementation == "generator":
        node = top_level_function(path, check["name"])
        if node is None:
            return False, f"{path} içinde {check['name']} fonksiyonu bulunamadı."
        decorators = {(dotted_name(item) or "").split(".")[-1] for item in node.decorator_list}
        if "contextmanager" not in decorators:
            return False, "Fonksiyon @contextmanager ile süslenmeli."
        if not any(isinstance(child, (ast.Yield, ast.YieldFrom)) for child in ast.walk(node)):
            return False, "Generator context manager yield içermeli."
        if check.get("requireTryFinally"):
            has_finally = any(isinstance(child, ast.Try) and child.finalbody for child in ast.walk(node))
            if not has_finally:
                return False, "Kaynak geri alma işlemi try/finally ile garanti edilmeli."
    else:
        return False, "Desteklenmeyen context manager uygulama türü."

    probe = check.get("probe")
    if probe:
        target_namespace = resolve_namespace(probe.get("module"), namespace)
        target = target_namespace.get(probe["name"])
        if not callable(target):
            return False, f"{probe['name']} probe fonksiyonu bulunamadı."
        ok, message = run_callable_cases(target, probe.get("cases", []))
        if not ok:
            return False, message

    return True, "Context manager protokolü ve gizli yaşam döngüsü senaryoları doğru."


def function_is_typed(path, name):
    node = top_level_function(path, name)
    if node is None or node.returns is None:
        return False
    parameters = list(node.args.posonlyargs) + list(node.args.args) + list(node.args.kwonlyargs)
    return all(argument.annotation is not None for argument in parameters)


def check_resource_project(check):
    missing = [path for path in check.get("requiredFiles", []) if not os.path.isfile(path)]
    if missing:
        return False, f"Eksik proje dosyaları: {', '.join(missing)}."
    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        return False, f"{path} sözdizimi hatası: {error}"

    decorator_check = {
        "name": check.get("decoratorName", "audit"),
        "file": "decorators.py",
        "parameterized": True,
        "requireWraps": True,
        "targets": [{
            "name": check.get("functionName", "rapor_uret"),
            "module": check.get("functionModule", "service"),
            "expectedName": check.get("functionName", "rapor_uret"),
            "cases": [],
        }],
    }
    ok, message = check_decorator(decorator_check, {})
    if not ok:
        return False, message

    context_node = top_level_class("resources.py", check.get("contextManagerName", "JsonKaynak"))
    if context_node is None:
        return False, "JsonKaynak sınıfı bulunamadı."
    methods = {
        child.name for child in context_node.body
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    if not {"__enter__", "__exit__"}.issubset(methods):
        return False, "JsonKaynak __enter__ ve __exit__ metotlarını içermeli."

    function_name = check.get("functionName", "rapor_uret")
    if not function_is_typed("service.py", function_name):
        return False, "rapor_uret bütün parametreleri ve dönüş değerini tiplendirmeli."

    try:
        decorators_module = importlib.import_module("decorators")
        resources_module = importlib.import_module("resources")
        service_module = importlib.import_module(check.get("functionModule", "service"))
        target = getattr(service_module, function_name)

        hidden_source = "__advanced_hidden_input.json"
        hidden_target = "__advanced_hidden_output.json"
        hidden_data = [
            {"kategori": "Yazılım", "tutar": "0.10"},
            {"kategori": "Donanım", "tutar": "25.40"},
            {"kategori": "Yazılım", "tutar": "0.20"},
        ]
        with open(hidden_source, "w", encoding="utf-8") as handle:
            json.dump(hidden_data, handle, ensure_ascii=False)

        before_count = len(getattr(decorators_module, "AUDIT_LOG", []))
        result = target(hidden_source, hidden_target)
        expected = {
            "islem_sayisi": 3,
            "toplam": "25.70",
            "kategoriler": ["Donanım", "Yazılım"],
        }
        if result != expected:
            return False, f"Gizli rapor sözleşmesi bozuldu: {result!r}."
        with open(hidden_target, "r", encoding="utf-8") as handle:
            if json.load(handle) != expected:
                return False, "Gizli JSON çıktı dosyası raporla eşleşmiyor."

        audit_log = getattr(decorators_module, "AUDIT_LOG", None)
        if not isinstance(audit_log, list) or len(audit_log) < before_count + 2:
            return False, "audit decorator çağrı öncesi ve sonrası kayıt üretmeli."
        recent = audit_log[-2:]
        if not all(isinstance(event, dict) and event.get("olay") == "rapor" for event in recent):
            return False, "Audit kayıtları olay adını sözleşmeye uygun taşımıyor."

        manager = resources_module.JsonKaynak(hidden_source)
        with manager as handle:
            if handle.closed:
                return False, "JsonKaynak with bloğu içinde açık dosya döndürmeli."
            json.load(handle)
        if manager.dosya is None or not manager.dosya.closed:
            return False, "JsonKaynak with bloğu sonrasında dosyayı kapatmalı."
    except BaseException as error:
        return False, f"Gizli kaynak yönetimi senaryosu hata verdi: {type(error).__name__}: {error}"
    finally:
        for path in ["__advanced_hidden_input.json", "__advanced_hidden_output.json"]:
            try:
                os.remove(path)
            except OSError:
                pass

    return True, "Decorator, metadata, context manager, Decimal ve JSON yaşam döngüsü kalite kapıları geçti."


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
        passed = False
        message = f"{path} sözdizimi hatası: {error}"
    elif runtime_error is not None:
        passed = False
        message = "Kod çalışırken yakalanmamış bir Python hatası oluştu."
    elif kind == "decorator_contract":
        passed, message = check_decorator(check, namespace)
    elif kind == "context_manager_contract":
        passed, message = check_context_manager(check, namespace)
    elif kind == "resource_management_project":
        passed, message = check_resource_project(check)
    elif kind == "file_exists":
        passed = os.path.isfile(check["path"])
        message = "Beklenen dosya üretildi." if passed else f"{check['path']} dosyası üretilmedi."
    elif kind == "file_unchanged":
        path = check["path"]
        try:
            passed = open(path, "r", encoding="utf-8").read() == sources.get(path)
        except (OSError, UnicodeError):
            passed = False
        message = "Kaynak veri değiştirilmedi." if passed else f"{path} kaynak verisi değiştirilmemelidir."
    elif kind == "json_file_equals":
        try:
            with open(check["path"], "r", encoding="utf-8") as handle:
                actual = json.load(handle)
            passed = actual == check.get("expected")
        except (OSError, UnicodeError, json.JSONDecodeError):
            passed = False
        message = "JSON çıktısı beklenen sözleşmeye uyuyor." if passed else f"{check['path']} JSON çıktısı eşleşmedi."
    elif kind == "stdout_regex":
        passed = re.search(check["pattern"], stdout, regex_flags(check.get("flags", ""))) is not None
        message = "Terminal çıktısı beklenen biçimde." if passed else "Terminal çıktısı beklenen biçimle eşleşmedi."
    else:
        passed = False
        message = f"İleri desen doğrulayıcısında desteklenmeyen kontrol türü: {kind}"
    results.append(item(check, passed, message))

passed_count = sum(1 for result in results if result["passed"])
total_count = len(results)
print(json.dumps({
    "taskId": spec["id"],
    "passed": total_count > 0 and passed_count == total_count and runtime_error is None,
    "score": round((passed_count / total_count) * 100) if total_count else 0,
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
  return `advanced-pattern-validation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function validateAdvancedPatternTask(options: {
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
    throw new Error("İleri desen doğrulama motoru sonuç verisi döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(
      diagnostic || runtimeMessage || "İleri desen doğrulama motoru çalıştırılamadı.",
    );
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
