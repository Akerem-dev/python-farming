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


def executable_assertions(function):
    def count_statements(statements):
        total = 0
        for statement in statements:
            if isinstance(statement, ast.Assert):
                total += 1
                continue
            if isinstance(statement, ast.If) and isinstance(statement.test, ast.Constant):
                branch = statement.body if bool(statement.test.value) else statement.orelse
                total += count_statements(branch)
                continue
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            for _, value in ast.iter_fields(statement):
                if isinstance(value, list):
                    total += count_statements([item for item in value if isinstance(item, ast.stmt)])
                elif isinstance(value, ast.stmt):
                    total += count_statements([value])
        return total

    return count_statements(function.body)


def count_tests(test_files):
    tests = []
    assertions = 0
    for path in test_files:
        tree = trees.get(path)
        if tree is None:
            continue
        for node in tree.body:
            if (
                isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                and node.name.startswith("test_")
                and len(node.args.args) == 0
            ):
                tests.append((path, node.name))
                assertions += executable_assertions(node)
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
    if not re.search(r"""__version__\s*=\s*['"]1\.0\.0['"]""", init_source):
        return False, "Paket sürümü 1.0.0 olarak tanımlanmalıdır."

    event_node = class_node("farming_platform/models.py", "Event")
    if event_node is None:
        return False, "models.py içinde Event sınıfı bulunamadı."
    event_annotations = {
        child.target.id: ast.unparse(child.annotation)
        for child in event_node.body
        if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name)
    }
    if {"event_id", "source", "category", "value"} - set(event_annotations):
        return False, "Event alanları eksik."
    if event_annotations["value"].split(".")[-1] != "Decimal":
        return False, "Event.value alanı Decimal olarak anotasyonlanmalıdır."
    event_decorators = {ast.unparse(decorator).replace(" ", "") for decorator in event_node.decorator_list}
    if not any(
        name.split("(", 1)[0].split(".")[-1] == "dataclass" and "frozen=True" in name
        for name in event_decorators
    ):
        return False, "Event @dataclass(frozen=True) olmalıdır."

    protocol_node = class_node("farming_platform/ports.py", "EventRepository")
    if protocol_node is None or not any(ast.unparse(base).endswith("Protocol") for base in protocol_node.bases):
        return False, "EventRepository gerçek bir Protocol olmalıdır."
    protocol_decorators = {ast.unparse(decorator).split(".")[-1] for decorator in protocol_node.decorator_list}
    if "runtime_checkable" not in protocol_decorators:
        return False, "EventRepository @runtime_checkable olmalıdır."
    protocol_methods = {
        node.name
        for node in protocol_node.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    missing_protocol_methods = {"save_all", "list_all"} - protocol_methods
    if missing_protocol_methods:
        return False, f"EventRepository metotları eksik: {', '.join(sorted(missing_protocol_methods))}."

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
    blocking_sleep_names = {"time.sleep"}
    collector_tree = trees.get("farming_platform/collector.py")
    if collector_tree is not None:
        for node in collector_tree.body:
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name == "time":
                        blocking_sleep_names.add(f"{alias.asname or 'time'}.sleep")
            elif isinstance(node, ast.ImportFrom) and node.module == "time":
                for alias in node.names:
                    if alias.name == "sleep":
                        blocking_sleep_names.add(alias.asname or alias.name)
    if names & blocking_sleep_names:
        return False, "Async collector bloklayan sleep kullanmamalıdır."

    profile_node = function_node("farming_platform/profiling.py", "profile_call")
    if profile_node is None:
        return False, "profiling.py içinde profile_call bulunamadı."
    profile_calls = call_names(profile_node)
    for required, label in [
        ("cProfile.Profile", "cProfile"),
        ("tracemalloc.start", "tracemalloc"),
        ("repeat", "timeit.repeat"),
    ]:
        if required not in profile_calls:
            return False, f"Profiling katmanında çalışan {label} çağrısı bulunamadı."

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
        service_module = importlib.import_module("farming_platform.service")
        profiling_module = importlib.import_module("farming_platform.profiling")
        app_module = importlib.import_module("farming_platform.app")

        if package.__version__ != "1.0.0":
            return False, "Paket sürümü çalışma zamanında 1.0.0 olmalıdır."
        if not dataclass_is_frozen(models.Event):
            return False, "Event çalışma zamanında frozen dataclass değildir."
        if not getattr(ports.EventRepository, "_is_protocol", False):
            return False, "EventRepository çalışma zamanında Protocol değildir."
        if not getattr(ports.EventRepository, "_is_runtime_protocol", False):
            return False, "EventRepository runtime_checkable değildir."
        if not callable(getattr(package, "platform_raporu", None)):
            return False, "platform_raporu paket API'sinde çalıştırılabilir olmalıdır."
        value_annotation = getattr(models.Event, "__annotations__", {}).get("value")
        if value_annotation is not Decimal and str(value_annotation).split(".")[-1].rstrip("'>") != "Decimal":
            return False, "Event.value çalışma zamanında Decimal anotasyonunu korumalıdır."
        for method_name in ["save_all", "list_all"]:
            if not callable(getattr(ports.EventRepository, method_name, None)):
                return False, f"EventRepository.{method_name} sözleşmesi eksik."

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
        if transport.max_active != 2:
            return False, "Collector limit=2 çağrısında iki isteği gerçekten eşzamanlı yürütmelidir."

        class MemoryRepository:
            def __init__(self):
                self.events = []

            def save_all(self, events):
                self.events.extend(events)

            def list_all(self):
                return list(self.events)

        memory_repository = MemoryRepository()
        service_transport = transport_module.FakeTransport([
            [{"event_id": "S2", "source": "api", "category": "alpha", "value": "2.00"}],
        ])
        service = service_module.PlatformService(memory_repository, service_transport)
        asyncio.run(service.synchronize([
            {"event_id": "S1", "source": "local", "category": "zeta", "value": "1.00"},
        ]))
        service_report = service.report()
        if service_report != {
            "event_count": 2,
            "total": "3.00",
            "sources": ["api", "local"],
            "top_category": "alpha",
        }:
            return False, f"PlatformService gizli DI senaryosu eşleşmedi: {service_report!r}."

        counters = {"profile": 0, "start": 0, "repeat": 0}
        real_profile = profiling_module.cProfile.Profile
        real_start = profiling_module.tracemalloc.start
        real_repeat = profiling_module.repeat

        def profile_factory(*args, **kwargs):
            counters["profile"] += 1
            return real_profile(*args, **kwargs)

        def start_spy(*args, **kwargs):
            counters["start"] += 1
            return real_start(*args, **kwargs)

        def repeat_spy(*args, **kwargs):
            counters["repeat"] += 1
            return real_repeat(*args, **kwargs)

        profiling_module.cProfile.Profile = profile_factory
        profiling_module.tracemalloc.start = start_spy
        profiling_module.repeat = repeat_spy
        try:
            profile_result = profiling_module.profile_call(lambda: 7)
        finally:
            profiling_module.cProfile.Profile = real_profile
            profiling_module.tracemalloc.start = real_start
            profiling_module.repeat = real_repeat
        if counters != {"profile": 1, "start": 1, "repeat": 1}:
            return False, f"Profiling araçları çalışma zamanında çağrılmadı: {counters!r}."
        if not isinstance(profile_result, dict) or profile_result.get("result") != 7:
            return False, "profile_call gerçek fonksiyon sonucunu korumalıdır."
        if not profile_result.get("profiled") or not profile_result.get("memory_measured"):
            return False, "profile_call CPU ve bellek ölçümünü raporlamalıdır."
        if int(profile_result.get("samples", 0)) < 2:
            return False, "profile_call en az iki zaman örneği almalıdır."

        wiring = {"repository": 0, "transport": 0, "service": 0, "sync": 0, "report": 0, "profile": 0, "closed": 0}

        class RepositorySpy:
            def __init__(self, path):
                wiring["repository"] += 1

            def close(self):
                wiring["closed"] += 1

        class TransportSpy:
            def __init__(self, pages):
                wiring["transport"] += 1

        class ServiceSpy:
            def __init__(self, repository, transport):
                wiring["service"] += 1

            async def synchronize(self, local_events):
                wiring["sync"] += 1

            def report(self):
                wiring["report"] += 1
                return {"event_count": 0, "total": "0.00", "sources": [], "top_category": None}

        def profile_spy(function, *args):
            wiring["profile"] += 1
            return {"result": function(*args), "profiled": True, "memory_measured": True, "samples": 2}

        originals = (
            app_module.SQLiteEventRepository,
            app_module.FakeTransport,
            app_module.PlatformService,
            app_module.profile_call,
        )
        app_module.SQLiteEventRepository = RepositorySpy
        app_module.FakeTransport = TransportSpy
        app_module.PlatformService = ServiceSpy
        app_module.profile_call = profile_spy
        try:
            wired_report = app_module.platform_raporu([], [])
        finally:
            (
                app_module.SQLiteEventRepository,
                app_module.FakeTransport,
                app_module.PlatformService,
                app_module.profile_call,
            ) = originals
        if wiring != {"repository": 1, "transport": 1, "service": 1, "sync": 1, "report": 1, "profile": 1, "closed": 1}:
            return False, f"platform_raporu katmanları dependency injection ile bağlamıyor: {wiring!r}."
        if wired_report.get("version") != "1.0.0" or wired_report.get("profiled") is not True:
            return False, "platform_raporu paket sürümü ve profiling sonucunu korumalıdır."

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
