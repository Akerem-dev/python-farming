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

const VALIDATOR_PATH = "__python_farming_asyncio_validator__.py";

type AsyncioCheck = Extract<TaskCheck, { kind: "asyncio_patterns" }>;

const VALIDATOR_SOURCE = String.raw`
import ast
import asyncio
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


def find_async_function(tree, name):
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == name:
            return node
    return None


def call_names(node):
    return {
        (dotted_name(child.func) or "").split(".")[-1]
        for child in ast.walk(node)
        if isinstance(child, ast.Call)
    }


def await_count(node):
    return sum(isinstance(child, ast.Await) for child in ast.walk(node))


def has_cancelled_error_handler(node):
    for child in ast.walk(node):
        if isinstance(child, ast.ExceptHandler):
            name = dotted_name(child.type) if child.type else ""
            if (name or "").split(".")[-1] == "CancelledError":
                return True
    return False


def has_async_context_manager(tree):
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
    if check.get("kind") != "asyncio_patterns":
        continue
    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        results.append(item(check, False, f"{path} ayrıştırılamadı: {error}"))
        continue

    failures = []
    for path in check.get("requiredFiles", []):
        if path not in sources:
            failures.append(f"eksik dosya: {path}")

    all_calls = set()
    all_trees = list(trees.values())
    for tree in all_trees:
        all_calls.update(call_names(tree))

    for expected in check.get("asyncFunctions", []):
        path = expected.get("file", entrypoint)
        tree = trees.get(path)
        node = find_async_function(tree, expected["name"]) if tree else None
        if node is None:
            failures.append(f"{path} içinde async def {expected['name']} bulunamadı")
            continue
        minimum = int(expected.get("minAwaitCount", 1))
        if await_count(node) < minimum:
            failures.append(f"{expected['name']} en az {minimum} await kullanmalı")
        required = set(expected.get("requiredCalls", []))
        missing = sorted(required - call_names(node))
        if missing:
            failures.append(f"{expected['name']} eksik çağrılar: {', '.join(missing)}")
        if expected.get("requireCancelledError") and not has_cancelled_error_handler(node):
            failures.append(f"{expected['name']} CancelledError durumunu yönetmiyor")

    required_calls = {
        "gather": check.get("requireGather"),
        "create_task": check.get("requireCreateTask"),
        "wait_for": check.get("requireWaitFor"),
        "Semaphore": check.get("requireSemaphore"),
    }
    for name, required in required_calls.items():
        if required and name not in all_calls:
            failures.append(f"{name} kullanımı bulunamadı")

    if check.get("requireCancellationHandling"):
        if not any(has_cancelled_error_handler(node) for tree in all_trees for node in ast.walk(tree) if isinstance(node, ast.AsyncFunctionDef)):
            failures.append("asyncio.CancelledError açıkça yönetilmiyor")

    if check.get("requireAsyncContextManager") and not any(has_async_context_manager(tree) for tree in all_trees):
        failures.append("async context manager sözleşmesi bulunamadı")

    for scenario in check.get("scenarios", []):
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
            elif "expected" in scenario and actual != normalize(scenario.get("expected")):
                failures.append(f"{label} {actual!r} döndürdü; beklenen {scenario.get('expected')!r}")
        except BaseException as error:
            failures.append(f"{label} senaryosu kurulamadı: {type(error).__name__}: {error}")

    if runtime_error is not None:
        failures.append("Giriş dosyası çalışırken yakalanmamış bir Python hatası oluştu")

    results.append(item(
        check,
        not failures,
        "Asyncio davranış sözleşmeleri doğru." if not failures else "; ".join(failures),
    ))

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
  return `asyncio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function validateAsyncioTask(input: {
  files: RuntimeSourceFile[];
  entrypoint: string;
  spec: TaskValidationSpec;
}): Promise<TaskValidationResult> {
  const check = input.spec.checks.find(
    (candidate): candidate is AsyncioCheck => candidate.kind === "asyncio_patterns",
  );
  if (!check) {
    throw new Error("Asyncio kalite kapısı bulunamadı.");
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
    throw new Error("Asyncio doğrulama motoru sonuç döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(diagnostic || runtimeMessage || "Asyncio doğrulayıcı çalıştırılamadı.");
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
