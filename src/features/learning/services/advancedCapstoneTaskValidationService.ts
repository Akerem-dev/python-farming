import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeSourceFile,
} from "../../../runtime/runtimeProtocol";
import type { TaskValidationSpec } from "../taskValidationTypes";
import { parseTaskValidationOutput } from "./taskValidationService";

const VALIDATOR_PATH = "__python_farming_advanced_capstone_validator__.py";

const VALIDATOR_SOURCE = String.raw`
import ast
import asyncio
import contextlib
import dataclasses
import importlib
import io
import json
import os
import re
import runpy
import sqlite3
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


def class_node(path, name):
    tree = trees.get(path)
    if tree is None:
        return None
    return next(
        (node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == name),
        None,
    )


def function_node(path, name):
    tree = trees.get(path)
    if tree is None:
        return None
    return next(
        (
            node
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name
        ),
        None,
    )


def call_names(node):
    names = set()
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        try:
            names.add(ast.unparse(child.func))
        except BaseException:
            pass
    return names


def count_tests(test_files):
    tests = []
    assertions = 0
    for path in test_files:
        tree = trees.get(path)
        if tree is None:
            continue
        assertions += sum(1 for node in ast.walk(tree) if isinstance(node, ast.Assert))
        tests.extend(
            (path, node.name)
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name.startswith("test_")
            and len(node.args.args) == 0
        )
    return tests, assertions


def run_student_tests(test_functions):
    for path, name in test_functions:
        namespace = runpy.run_path(path, run_name=f"__python_farming_test_{name}__")
        target = namespace.get(name)
        if not callable(target):
            return False, f"{path} içindeki {name} çalıştırılabilir değil."
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                result = target()
                if asyncio.iscoroutine(result):
                    asyncio.run(result)
        except BaseException as error:
            return False, f"{name} başarısız oldu: {type(error).__name__}: {error}"
    return True, "Öğrencinin test paketi doğru uygulamada geçti."


def dataclass_is_frozen(target):
    params = getattr(target, "__dataclass_params__", None)
    return dataclasses.is_dataclass(target) and bool(params and params.frozen)


def check_advanced_capstone(check):
    missing = [path for path in check.get("requiredFiles", []) if not os.path.isfile(path)]
    if missing:
        return False, f"Eksik proje dosyaları: {', '.join(missing)}."
    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        return False, f"{path} sözdizimi hatası: {error}"

    init_source = sources.get("farming_platform/__init__.py", "")
    if not re.search(r"__version__\s*=\s*['\"]1\.0\.0['\"]", init_source):
        return False, "Paket sürümü 1.0.0 olarak tanımlanmalıdır."
    if not re.search(r"from\s+\.app\s+import\s+platform_raporu", init_source):
        return False, "platform_raporu paket API'sinden dışa aktarılmalıdır."

    event_node = class_node("farming_platform/models.py", "Event")
    if event_node is None:
        return False, "models.py içinde Event sınıfı bulunamadı."
    event_fields = {
        child.target.id
        for child in event_node.body
        if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name)
    }
    if {"event_id", "source", "category", "value"} - event_fields:
        return False, "Event alanları eksik."
    event_decorators = {ast.unparse(decorator) for decorator in event_node.decorator_list}
    if not any(name.startswith("dataclass") and "frozen=True" in name.replace(" ", "") for name in event_decorators):
        return False, "Event @dataclass(frozen=True) olmalıdır."

    protocol_node = class_node("farming_platform/ports.py", "EventRepository")
    if protocol_node is None or not any(ast.unparse(base).endswith("Protocol") for base in protocol_node.bases):
        return False, "EventRepository gerçek bir Protocol olmalıdır."
    protocol_decorators = {ast.unparse(decorator).split(".")[-1] for decorator in protocol_node.decorator_list}
    if "runtime_checkable" not in protocol_decorators:
        return False, "EventRepository @runtime_checkable olmalıdır."

    repository_source = sources.get("farming_platform/repository.py", "")
    for pattern, label in [
        (r"sqlite3\.connect\s*\(", "sqlite3 bağlantısı"),
        (r"VALUES\s*\(\s*\?\s*,\s*\?\s*,\s*\?\s*,\s*\?\s*\)", "parametrik INSERT"),
        (r"with\s+self\.connection\s*:", "transaction sınırı"),
    ]:
        if re.search(pattern, repository_source, re.IGNORECASE | re.MULTILINE) is None:
            return False, f"Repository içinde {label} bulunamadı."

    collector_node = function_node("farming_platform/collector.py", "collect_remote")
    if not isinstance(collector_node, ast.AsyncFunctionDef):
        return False, "collect_remote async def olmalıdır."
    names = call_names(collector_node)
    for required in ["asyncio.Semaphore", "asyncio.create_task", "asyncio.gather"]:
        if required not in names:
            return False, f"collect_remote içinde {required} çağrısı gerekli."
    if not any(isinstance(node, ast.Await) for node in ast.walk(collector_node)):
        return False, "collect_remote en az bir await kullanmalıdır."
    if "time.sleep" in names:
        return False, "Async collector time.sleep kullanmamalıdır."

    profiling_source = sources.get("farming_platform/profiling.py", "")
    for pattern, label in [
        (r"cProfile\.Profile\s*\(", "cProfile"),
        (r"tracemalloc\.start\s*\(", "tracemalloc"),
        (r"repeat\s*\(", "timeit.repeat"),
    ]:
        if re.search(pattern, profiling_source, re.MULTILINE) is None:
            return False, f"Profiling katmanında {label} bulunamadı."

    tests, assertions = count_tests(check.get("testFiles", []))
    minimum_tests = int(check.get("minTests", 0))
    minimum_assertions = int(check.get("minAssertions", 0))
    if len(tests) < minimum_tests:
        return False, f"En az {minimum_tests} test fonksiyonu gerekli; bulunan: {len(tests)}."
    if assertions < minimum_assertions:
        return False, f"En az {minimum_assertions} assert gerekli; bulunan: {assertions}."
    tests_ok, tests_message = run_student_tests(tests)
    if not tests_ok:
        return False, tests_message

    try:
        package = importlib.import_module("farming_platform")
        models = importlib.import_module("farming_platform.models")
        ports = importlib.import_module("farming_platform.ports")
        repository_module = importlib.import_module("farming_platform.repository")
        transport_module = importlib.import_module("farming_platform.transport")
        collector_module = importlib.import_module("farming_platform.collector")

        if package.__version__ != "1.0.0":
            return False, "Paket sürümü çalışma zamanında 1.0.0 olmalıdır."
        if not dataclass_is_frozen(models.Event):
            return False, "Event çalışma zamanında frozen dataclass değildir."
        if not getattr(ports.EventRepository, "_is_protocol", False):
            return False, "EventRepository çalışma zamanında Protocol değildir."
        if not getattr(ports.EventRepository, "_is_runtime_protocol", False):
            return False, "EventRepository runtime_checkable değildir."

        store = repository_module.SQLiteEventRepository(":memory:")
        first = models.Event("A", "local", "sales", Decimal("10.00"))
        store.save_all([first])
        if store.list_all() != [first]:
            return False, "SQLite repository kaydet/listele çevrimi veriyi korumuyor."
        second = models.Event("B", "local", "ops", Decimal("5.00"))
        try:
            store.save_all([second, first])
            return False, "Duplicate event_id transaction hatası üretmelidir."
        except sqlite3.IntegrityError:
            pass
        if store.list_all() != [first]:
            return False, "Başarısız transaction kısmi kayıt bıraktı."
        store.close()

        transport = transport_module.FakeTransport([
            [{"event_id": "R1", "source": "api", "category": "sales", "value": "7.50"}],
            [{"event_id": "R2", "source": "api", "category": "sales", "value": "2.50"}],
        ])
        collected = asyncio.run(collector_module.collect_remote(transport, 2))
        if [item["event_id"] for item in collected] != ["R1", "R2"]:
            return False, "Async collector sayfaları sırasıyla birleştirmedi."
        if transport.max_active > 2:
            return False, "Semaphore eşzamanlılık sınırını korumadı."

        cases = [
            (
                [
                    {"event_id": "L1", "source": "local", "category": "sales", "value": "10.00"},
                    {"event_id": "L2", "source": "local", "category": "ops", "value": "5.00"},
                ],
                [
                    [{"event_id": "R1", "source": "api", "category": "sales", "value": "7.50"}],
                    [{"event_id": "R2", "source": "api", "category": "sales", "value": "2.50"}],
                ],
                {
                    "event_count": 4,
                    "total": "25.00",
                    "sources": ["api", "local"],
                    "top_category": "sales",
                    "version": "1.0.0",
                    "profiled": True,
                },
            ),
            (
                [],
                [],
                {
                    "event_count": 0,
                    "total": "0.00",
                    "sources": [],
                    "top_category": None,
                    "version": "1.0.0",
                    "profiled": True,
                },
            ),
            (
                [{"event_id": "L1", "source": "device", "category": "zeta", "value": "1.25"}],
                [[{"event_id": "R1", "source": "api", "category": "alpha", "value": "2.75"}]],
                {
                    "event_count": 2,
                    "total": "4.00",
                    "sources": ["api", "device"],
                    "top_category": "alpha",
                    "version": "1.0.0",
                    "profiled": True,
                },
            ),
        ]
        for local_events, remote_pages, expected in cases:
            actual = package.platform_raporu(local_events, remote_pages)
            if actual != expected:
                return False, f"Gizli platform raporu eşleşmedi: {actual!r}."
    except BaseException as error:
        return False, f"Gizli ileri seviye senaryosu hata verdi: {type(error).__name__}: {error}"

    return True, "Mimari, async, SQLite, profiling, paket API'si ve test paketi geçti."


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
    if kind == "advanced_capstone":
        if runtime_error is not None:
            passed = False
            message = "İleri seviye proje çalışırken yakalanmamış bir Python hatası oluştu."
        else:
            passed, message = check_advanced_capstone(check)
    else:
        passed = False
        message = f"İleri seviye doğrulayıcısında desteklenmeyen kontrol türü: {kind}"
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
  return `advanced-capstone-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function validateAdvancedCapstoneTask(options: {
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
    throw new Error("İleri seviye proje doğrulama motoru sonuç verisi döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(
      diagnostic || runtimeMessage || "İleri seviye proje doğrulama motoru çalıştırılamadı.",
    );
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
