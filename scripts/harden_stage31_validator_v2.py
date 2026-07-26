from pathlib import Path

VALIDATOR = Path("src/features/learning/services/advancedCapstoneTaskValidationService.ts")
text = VALIDATOR.read_text(encoding="utf-8")


def replace_between(start: str, end: str, replacement: str):
    global text
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"start marker not found: {start!r}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"end marker not found: {end!r}")
    text = text[:start_index] + replacement + text[end_index:]


def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f"pattern not found: {old[:120]!r}")
    text = text.replace(old, new, 1)


replace_between(
    "def count_tests(test_files):",
    "def run_student_tests(test_functions):",
    '''def executable_assertions(function):
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


''',
)

replace_between(
    '    init_source = sources.get("farming_platform/__init__.py", "")',
    '    event_node = class_node("farming_platform/models.py", "Event")',
    '''    init_source = sources.get("farming_platform/__init__.py", "")
    if not re.search(r"__version__\\s*=\\s*['\"]1\\.0\\.0['\"]", init_source):
        return False, "Paket sürümü 1.0.0 olarak tanımlanmalıdır."

''',
)

replace_between(
    "    event_fields = {",
    '    protocol_node = class_node("farming_platform/ports.py", "EventRepository")',
    '''    event_annotations = {
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

''',
)

replace_between(
    "    protocol_decorators =",
    '    repository_source = sources.get("farming_platform/repository.py", "")',
    '''    protocol_decorators = {ast.unparse(decorator).split(".")[-1] for decorator in protocol_node.decorator_list}
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

''',
)

replace_between(
    '    collector_node = function_node("farming_platform/collector.py", "collect_remote")',
    '    tests, assertions = count_tests(check.get("testFiles", []))',
    '''    collector_node = function_node("farming_platform/collector.py", "collect_remote")
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

''',
)

replace_once(
    '        collector_module = importlib.import_module("farming_platform.collector")',
    '''        collector_module = importlib.import_module("farming_platform.collector")
        service_module = importlib.import_module("farming_platform.service")
        profiling_module = importlib.import_module("farming_platform.profiling")
        app_module = importlib.import_module("farming_platform.app")''',
)

replace_once(
    '''        if not getattr(ports.EventRepository, "_is_runtime_protocol", False):
            return False, "EventRepository runtime_checkable değildir."''',
    '''        if not getattr(ports.EventRepository, "_is_runtime_protocol", False):
            return False, "EventRepository runtime_checkable değildir."
        if not callable(getattr(package, "platform_raporu", None)):
            return False, "platform_raporu paket API'sinde çalıştırılabilir olmalıdır."
        value_annotation = getattr(models.Event, "__annotations__", {}).get("value")
        if value_annotation is not Decimal and str(value_annotation).split(".")[-1].rstrip("'>") != "Decimal":
            return False, "Event.value çalışma zamanında Decimal anotasyonunu korumalıdır."
        for method_name in ["save_all", "list_all"]:
            if not callable(getattr(ports.EventRepository, method_name, None)):
                return False, f"EventRepository.{method_name} sözleşmesi eksik."''',
)

replace_once(
    '''        if transport.max_active > 2:
            return False, "Semaphore eşzamanlılık sınırını korumadı."''',
    '''        if transport.max_active != 2:
            return False, "Collector limit=2 çağrısında iki isteği gerçekten eşzamanlı yürütmelidir."''',
)

insert = '''        class MemoryRepository:
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

'''
replace_once("        cases = [", insert + "        cases = [")

VALIDATOR.write_text(text, encoding="utf-8")

PACKAGE = Path("public/content/modules/advanced-project.json")
package_text = PACKAGE.read_text(encoding="utf-8")
if '"timeoutMs": 20000' not in package_text:
    raise SystemExit("advanced project timeout pattern not found")
PACKAGE.write_text(package_text.replace('"timeoutMs": 20000', '"timeoutMs": 10000', 1), encoding="utf-8")
