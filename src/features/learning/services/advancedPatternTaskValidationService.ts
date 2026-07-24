import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeSourceFile,
} from "../../../runtime/runtimeProtocol";
import type {
  TaskCheck,
  TaskValidationResult,
  TaskValidationSpec,
} from "../taskValidationTypes";
import { parseTaskValidationOutput } from "./taskValidationService";

const VALIDATOR_PATH = "__python_farming_advanced_pattern_validator__.py";

type AdvancedPatternCheck = Extract<TaskCheck, { kind: "advanced_patterns" }>;

const VALIDATOR_SOURCE = String.raw`
import ast
import asyncio
import builtins
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

payload = json.loads(sys.stdin.read())
file_paths = payload["files"]
entrypoint = payload["entrypoint"]
spec = payload["spec"]
started_at = time.perf_counter()
sys.dont_write_bytecode = True


def dotted_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    if isinstance(node, ast.Call):
        return dotted_name(node.func)
    return None


def normalize(value):
    if isinstance(value, tuple):
        return [normalize(item) for item in value]
    if isinstance(value, set):
        return sorted(normalize(item) for item in value)
    if isinstance(value, dict):
        return {str(key): normalize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [normalize(item) for item in value]
    return value


def item(check, passed, message):
    return {
        "id": check["id"],
        "label": check["label"],
        "visibility": check["visibility"],
        "passed": bool(passed),
        "message": message,
    }


def find_function(tree, name):
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    return None


def find_class(tree, name):
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == name:
            return node
    return None


def decorator_names(node):
    return {(dotted_name(item) or "").split(".")[-1] for item in node.decorator_list}


def has_wraps(node):
    return any(
        isinstance(child, ast.Call)
        and (dotted_name(child.func) or "").split(".")[-1] == "wraps"
        for child in ast.walk(node)
    )


def nested_function_count(node):
    return sum(
        1 for child in node.body
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
    )


def returns_callable(node):
    nested_names = {
        child.name for child in node.body
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    return any(
        isinstance(child, ast.Return)
        and isinstance(child.value, ast.Name)
        and child.value.id in nested_names
        for child in ast.walk(node)
    )


def generator_counts(node):
    yields = sum(isinstance(child, ast.Yield) for child in ast.walk(node))
    yield_from = sum(isinstance(child, ast.YieldFrom) for child in ast.walk(node))
    return yields + yield_from, yield_from


def find_async_function(tree, name):
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


def exception_type(name):
    candidate = getattr(builtins, name, None)
    if isinstance(candidate, type) and issubclass(candidate, BaseException):
        return candidate
    raise ValueError(f"Bilinmeyen exception sınıfı: {name}")


def compare(actual, expected):
    return normalize(actual) == normalize(expected)


sources = {}
trees = {}
syntax_errors = {}
for path in file_paths:
    if path == ${JSON.stringify(VALIDATOR_PATH)}:
        continue
    try:
        source = open(path, "r", encoding="utf-8").read()
        sources[path] = source
        if path.endswith(".py"):
            trees[path] = ast.parse(source, filename=path, mode="exec")
    except (OSError, UnicodeError, SyntaxError) as error:
        syntax_errors[path] = str(error)

stdout_buffer = io.StringIO()
stderr_buffer = io.StringIO()
runtime_error = None
if not syntax_errors:
    sys.path.insert(0, os.getcwd())
    try:
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            runpy.run_path(entrypoint, run_name="__main__")
    except BaseException:
        runtime_error = traceback.format_exc()

results = []
for check in spec.get("checks", []):
    if check.get("kind") != "advanced_patterns":
        continue
    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        results.append(item(check, False, f"{path} ayrıştırılamadı: {error}"))
        continue

    failures = []
    for path in check.get("requiredFiles", []):
        if path not in sources:
            failures.append(f"eksik dosya: {path}")

    for expected in check.get("decorators", []):
        path = expected.get("file", entrypoint)
        tree = trees.get(path)
        node = find_function(tree, expected["name"]) if tree else None
        if node is None:
            failures.append(f"{expected['name']} decorator fonksiyonu bulunamadı")
            continue
        if nested_function_count(node) < int(expected.get("minNestedFunctions", 1)):
            failures.append(f"{expected['name']} wrapper fonksiyonu içermiyor")
        if expected.get("parameterized") and not returns_callable(node):
            failures.append(f"{expected['name']} decorator fabrikası inner decorator döndürmüyor")
        if expected.get("requireWraps") and not has_wraps(node):
            failures.append(f"{expected['name']} functools.wraps kullanmıyor")

    for expected in check.get("decoratedFunctions", []):
        path = expected.get("file", entrypoint)
        tree = trees.get(path)
        node = find_function(tree, expected["name"]) if tree else None
        names = decorator_names(node) if node else set()
        required = expected["decorator"].split(".")[-1]
        if node is None or required not in names:
            failures.append(f"{expected['name']} @{required} ile dekore edilmemiş")

    for expected in check.get("contextManagers", []):
        path = expected.get("file", entrypoint)
        tree = trees.get(path)
        implementation = expected.get("implementation")
        if implementation == "class":
            node = find_class(tree, expected["name"]) if tree else None
            method_names = {
                child.name for child in node.body
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
            } if node else set()
            if node is None or not {"__enter__", "__exit__"}.issubset(method_names):
                failures.append(f"{expected['name']} __enter__/__exit__ sözleşmesini tamamlamıyor")
        elif implementation == "generator":
            node = find_function(tree, expected["name"]) if tree else None
            names = decorator_names(node) if node else set()
            has_yield = bool(node and any(isinstance(child, (ast.Yield, ast.YieldFrom)) for child in ast.walk(node)))
            if node is None or "contextmanager" not in names or not has_yield:
                failures.append(f"{expected['name']} @contextmanager ve yield kullanmıyor")

    for expected in check.get("generators", []):
        path = expected.get("file", entrypoint)
        tree = trees.get(path)
        node = find_function(tree, expected["name"]) if tree else None
        if node is None:
            failures.append(f"{path} içinde {expected['name']} fonksiyonu bulunamadı")
            continue
        yield_count, yield_from_count = generator_counts(node)
        minimum = int(expected.get("minYieldCount", 1))
        if yield_count < minimum:
            failures.append(f"{expected['name']} en az {minimum} yield noktası içermeli")
        maximum = expected.get("maxYieldCount")
        if maximum is not None and yield_count > int(maximum):
            failures.append(f"{expected['name']} en fazla {maximum} yield noktası içermeli")
        if expected.get("requireYieldFrom") and yield_from_count == 0:
            failures.append(f"{expected['name']} yield from kullanmıyor")

    all_calls = set()
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

    for scenario in check.get("scenarios", []):
        label = f"{scenario['module']}.{scenario['name']}"
        try:
            module = importlib.import_module(scenario["module"])
            factory = getattr(module, scenario["name"])
            generator = factory(*scenario.get("args", []), **scenario.get("kwargs", {}))
            if not inspect.isgenerator(generator):
                failures.append(f"{label} gerçek generator nesnesi döndürmüyor")
                continue

            for index, action in enumerate(scenario.get("actions", []), start=1):
                kind = action["kind"]
                try:
                    if kind == "next":
                        actual = next(generator)
                    elif kind == "send":
                        actual = generator.send(action.get("value"))
                    elif kind == "throw":
                        exc = exception_type(action["exception"])
                        actual = generator.throw(exc(action.get("message", "")))
                    elif kind == "close":
                        actual = generator.close()
                    elif kind == "collect":
                        actual = list(generator)
                    elif kind == "state":
                        actual = inspect.getgeneratorstate(generator)
                    else:
                        raise ValueError(f"Desteklenmeyen generator aksiyonu: {kind}")
                except BaseException as error:
                    expected_exception = action.get("expectedException")
                    if expected_exception and type(error).__name__ == expected_exception:
                        pattern = action.get("messagePattern")
                        if pattern and re.search(pattern, str(error)) is None:
                            failures.append(f"{label} adım {index} exception mesajı eşleşmedi")
                        continue
                    failures.append(f"{label} adım {index} çalıştırılamadı: {type(error).__name__}: {error}")
                    break

                if "expectedException" in action:
                    failures.append(f"{label} adım {index} {action['expectedException']} üretmeliydi")
                    break
                if "expected" in action and not compare(actual, action.get("expected")):
                    failures.append(
                        f"{label} adım {index} {normalize(actual)!r} döndürdü; beklenen {action.get('expected')!r}"
                    )
                    break
        except BaseException as error:
            failures.append(f"{label} senaryosu kurulamadı: {type(error).__name__}: {error}")

    for scenario in check.get("asyncScenarios", []):
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

    for case in check.get("functionCases", []):
        try:
            module = importlib.import_module(case["module"])
            function = getattr(module, case["name"])
            actual = normalize(function(*case.get("args", []), **case.get("kwargs", {})))
            if actual != case.get("expected"):
                failures.append(f"{case['module']}.{case['name']} gizli senaryoda {actual!r} döndürdü")
        except BaseException as error:
            failures.append(f"{case['module']}.{case['name']} çalıştırılamadı: {type(error).__name__}: {error}")

    for generated in check.get("generatedFiles", []):
        path = generated["path"]
        if not os.path.isfile(path):
            failures.append(f"üretilen dosya bulunamadı: {path}")
            continue
        pattern = generated.get("pattern")
        if pattern:
            content = open(path, "r", encoding="utf-8").read()
            if re.search(pattern, content, re.MULTILINE | re.DOTALL) is None:
                failures.append(f"{path} beklenen içeriği taşımıyor")

    if runtime_error is not None:
        failures.append("Giriş dosyası çalışırken yakalanmamış bir Python hatası oluştu")

    results.append(
        item(
            check,
            not failures,
            "İleri seviye davranış sözleşmeleri doğru."
            if not failures else "; ".join(failures),
        )
    )

passed = bool(results) and all(result["passed"] for result in results)
print(json.dumps({
    "taskId": spec["id"],
    "passed": passed,
    "score": 100 if passed else round(100 * sum(1 for result in results if result["passed"]) / max(len(results), 1)),
    "checks": results,
    "stdout": stdout_buffer.getvalue(),
    "stderr": stderr_buffer.getvalue(),
    "runtimeError": runtime_error,
    "durationMs": round((time.perf_counter() - started_at) * 1000),
}, ensure_ascii=False))
`;

function createRequestId() {
  return `advanced-pattern-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function validateAdvancedPatternTask(input: {
  files: RuntimeSourceFile[];
  entrypoint: string;
  spec: TaskValidationSpec;
}): Promise<TaskValidationResult> {
  const check = input.spec.checks.find(
    (candidate): candidate is AdvancedPatternCheck => candidate.kind === "advanced_patterns",
  );
  if (!check) {
    throw new Error("İleri seviye kalite kapısı bulunamadı.");
  }

  const validatorFile: RuntimeSourceFile = {
    path: VALIDATOR_PATH,
    content: VALIDATOR_SOURCE,
  };
  const projectFiles = [validatorFile, ...input.files];
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
          entrypoint: input.entrypoint,
          spec: input.spec,
        }),
      ],
      timeoutMs: input.spec.timeoutMs,
    },
  });

  if (!response.payload) {
    throw new Error("İleri seviye doğrulama motoru sonuç döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(diagnostic || runtimeMessage || "İleri seviye doğrulayıcı çalıştırılamadı.");
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
