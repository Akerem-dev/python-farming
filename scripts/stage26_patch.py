from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
service_path = root / "src/features/learning/services/advancedPatternTaskValidationService.ts"
service = service_path.read_text(encoding="utf-8")

service = service.replace(
    "import ast\nimport builtins",
    "import ast\nimport asyncio\nimport builtins",
    1,
)

helper_marker = "def exception_type(name):\n"
helpers = '''def find_async_function(tree, name):
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == name:
            return node
    return None


def async_call_names(node):
    return {
        (dotted_name(child.func) or "").split(".")[-1]
        for child in ast.walk(node)
        if isinstance(child, ast.Call)
    }


def async_await_count(node):
    return sum(isinstance(child, ast.Await) for child in ast.walk(node))


def has_cancelled_error_handler(node):
    for child in ast.walk(node):
        if isinstance(child, ast.ExceptHandler):
            name = dotted_name(child.type) if child.type else ""
            if (name or "").split(".")[-1] == "CancelledError":
                return True
    return False


def tree_has_async_with(tree):
    return any(isinstance(node, ast.AsyncWith) for node in ast.walk(tree))


def tree_has_async_context_manager(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            methods = {
                child.name for child in node.body
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
            }
            if {"__aenter__", "__aexit__"}.issubset(methods):
                return True
        if isinstance(node, ast.AsyncFunctionDef):
            decorators = {(dotted_name(item) or "").split(".")[-1] for item in node.decorator_list}
            if "asynccontextmanager" in decorators and any(
                isinstance(child, (ast.Yield, ast.YieldFrom)) for child in ast.walk(node)
            ):
                return True
    return False


'''
if "def find_async_function(tree, name):" not in service:
    service = service.replace(helper_marker, helpers + helper_marker, 1)

scenario_marker = '    for scenario in check.get("scenarios", []):\n'
async_structure = '''    all_calls = set()
    for tree in trees.values():
        all_calls.update(async_call_names(tree))

    for expected in check.get("asyncFunctions", []):
        path = expected.get("file", entrypoint)
        tree = trees.get(path)
        node = find_async_function(tree, expected["name"]) if tree else None
        if node is None:
            failures.append(f"{path} içinde async def {expected['name']} bulunamadı")
            continue
        minimum = int(expected.get("minAwaitCount", 1))
        if async_await_count(node) < minimum:
            failures.append(f"{expected['name']} en az {minimum} await kullanmalı")
        required = set(expected.get("requiredCalls", []))
        missing = sorted(required - async_call_names(node))
        if missing:
            failures.append(f"{expected['name']} eksik çağrılar: {', '.join(missing)}")
        if expected.get("requireCancelledError") and not has_cancelled_error_handler(node):
            failures.append(f"{expected['name']} CancelledError durumunu yönetmiyor")

    required_async_calls = {
        "gather": check.get("requireGather"),
        "create_task": check.get("requireCreateTask"),
        "wait_for": check.get("requireWaitFor"),
        "Semaphore": check.get("requireSemaphore"),
    }
    for name, required in required_async_calls.items():
        if required and name not in all_calls:
            failures.append(f"{name} kullanımı bulunamadı")

    if check.get("requireCancellationHandling"):
        handlers = [
            node for tree in trees.values() for node in ast.walk(tree)
            if isinstance(node, ast.AsyncFunctionDef) and has_cancelled_error_handler(node)
        ]
        if not handlers:
            failures.append("asyncio.CancelledError açıkça yönetilmiyor")

    if check.get("requireAsyncWith") and not any(tree_has_async_with(tree) for tree in trees.values()):
        failures.append("async with kullanımı bulunamadı")

    if check.get("requireAsyncContextManager") and not any(
        tree_has_async_context_manager(tree) for tree in trees.values()
    ):
        failures.append("async context manager sözleşmesi bulunamadı")

'''
if 'check.get("asyncFunctions"' not in service:
    service = service.replace(scenario_marker, async_structure + scenario_marker, 1)

function_case_marker = '    for case in check.get("functionCases", []):\n'
async_scenarios = '''    for scenario in check.get("asyncScenarios", []):
        label = f"{scenario['module']}.{scenario['name']}"
        try:
            module = importlib.import_module(scenario["module"])
            function = getattr(module, scenario["name"])
            if not asyncio.iscoroutinefunction(function):
                failures.append(f"{label} async fonksiyon değil")
                continue

            async def invoke():
                coroutine = function(*scenario.get("args", []), **scenario.get("kwargs", {}))
                timeout_ms = scenario.get("timeoutMs")
                if timeout_ms is not None:
                    return await asyncio.wait_for(coroutine, timeout=float(timeout_ms) / 1000)
                return await coroutine

            try:
                actual = normalize(asyncio.run(invoke()))
            except BaseException as error:
                expected_exception = scenario.get("expectedException")
                if expected_exception and type(error).__name__ == expected_exception:
                    pattern = scenario.get("messagePattern")
                    if pattern and re.search(pattern, str(error)) is None:
                        failures.append(f"{label} exception mesajı eşleşmedi")
                    continue
                failures.append(f"{label} çalıştırılamadı: {type(error).__name__}: {error}")
                continue

            if scenario.get("expectedException"):
                failures.append(f"{label} {scenario['expectedException']} üretmeliydi")
            elif "expected" in scenario and not compare(actual, scenario.get("expected")):
                failures.append(f"{label} {actual!r} döndürdü; beklenen {scenario.get('expected')!r}")
        except BaseException as error:
            failures.append(f"{label} senaryosu kurulamadı: {type(error).__name__}: {error}")

'''
if 'check.get("asyncScenarios"' not in service:
    service = service.replace(function_case_marker, async_scenarios + function_case_marker, 1)

service_path.write_text(service, encoding="utf-8")

index_path = root / "public/content/module-packages.json"
index = json.loads(index_path.read_text(encoding="utf-8"))
async_file = "/content/modules/async-await.json"
if async_file not in index["files"]:
    index["files"].append(async_file)
index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

unused = root / "src/features/learning/services/asyncioTaskValidationService.ts"
if unused.exists():
    unused.unlink()
