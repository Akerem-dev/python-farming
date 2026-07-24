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

const VALIDATOR_PATH = "__python_farming_async_validator__.py";

type AsyncProgrammingCheck = Extract<TaskCheck, { kind: "async_programming" }>;

const VALIDATOR_SOURCE = String.raw`
import ast
import asyncio
import contextlib
import importlib
import io
import json
import os
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
    names = []
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            name = dotted_name(child.func)
            if name:
                names.append(name)
    return names


def call_matches(actual, expected):
    return actual == expected or actual.endswith(f".{expected}") or expected.endswith(f".{actual}")


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


async def execute_scenario(scenario):
    module = importlib.import_module(scenario["module"])
    function = getattr(module, scenario["name"])
    args = scenario.get("args", [])
    kwargs = scenario.get("kwargs", {})
    action = scenario.get("action", "call")
    started = time.perf_counter()

    if action == "collect":
        async_iterable = function(*args, **kwargs)
        actual = []
        async for value in async_iterable:
            actual.append(value)
    elif action == "cancel":
        task = asyncio.create_task(function(*args, **kwargs))
        await asyncio.sleep(float(scenario.get("cancelAfterMs", 0)) / 1000)
        task.cancel()
        expected_exception = scenario.get("expectedException", "CancelledError")
        caught = None
        try:
            await task
        except BaseException as error:
            caught = type(error).__name__
        if caught != expected_exception:
            raise AssertionError(f"{expected_exception} bekleniyordu, {caught or 'exception yok'} alındı")
        observe_index = scenario.get("observeArgIndex")
        actual = args[int(observe_index)] if observe_index is not None else caught
    else:
        try:
            actual = await function(*args, **kwargs)
        except BaseException as error:
            expected_exception = scenario.get("expectedException")
            if expected_exception and type(error).__name__ == expected_exception:
                actual = type(error).__name__
            else:
                raise

    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    maximum = scenario.get("maxDurationMs")
    if maximum is not None and elapsed_ms > float(maximum):
        raise AssertionError(f"{elapsed_ms} ms sürdü; en fazla {maximum} ms olmalı")

    if "expected" in scenario and not compare(actual, scenario["expected"]):
        raise AssertionError(f"{normalize(actual)!r} döndürdü; beklenen {scenario['expected']!r}")
    return actual


results = []
for check in spec.get("checks", []):
    if check.get("kind") != "async_programming":
        continue
    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        results.append(item(check, False, f"{path} ayrıştırılamadı: {error}"))
        continue

    failures = []
    for path in check.get("requiredFiles", []):
        if path not in sources:
            failures.append(f"eksik dosya: {path}")

    for expected in check.get("asyncFunctions", []):
        path = expected.get("file", entrypoint)
        tree = trees.get(path)
        node = find_async_function(tree, expected["name"]) if tree else None
        if node is None:
            failures.append(f"{path} içinde async def {expected['name']} bulunamadı")
            continue

        await_count = sum(isinstance(child, ast.Await) for child in ast.walk(node))
        async_for_count = sum(isinstance(child, ast.AsyncFor) for child in ast.walk(node))
        async_with_count = sum(isinstance(child, ast.AsyncWith) for child in ast.walk(node))
        if await_count < int(expected.get("minAwaitCount", 0)):
            failures.append(f"{expected['name']} yeterli await noktası içermiyor")
        if async_for_count < int(expected.get("minAsyncForCount", 0)):
            failures.append(f"{expected['name']} async for kullanmıyor")
        if async_with_count < int(expected.get("minAsyncWithCount", 0)):
            failures.append(f"{expected['name']} async with kullanmıyor")

        names = call_names(node)
        for required in expected.get("requiredCalls", []):
            if not any(call_matches(actual, required) for actual in names):
                failures.append(f"{expected['name']} {required} çağrısını kullanmıyor")
        for forbidden in expected.get("disallowCalls", []):
            if any(call_matches(actual, forbidden) for actual in names):
                failures.append(f"{expected['name']} bloke eden {forbidden} çağrısını kullanıyor")

    for scenario in check.get("scenarios", []):
        label = f"{scenario['module']}.{scenario['name']}"
        try:
            asyncio.run(execute_scenario(scenario))
        except BaseException as error:
            failures.append(f"{label} gizli senaryosu başarısız: {type(error).__name__}: {error}")

    if runtime_error is not None:
        failures.append("Giriş dosyası çalışırken yakalanmamış bir Python hatası oluştu")

    results.append(
        item(
            check,
            not failures,
            "Async davranış, zamanlama ve yaşam döngüsü sözleşmeleri doğru."
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
  return `async-programming-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function validateAsyncProgrammingTask(input: {
  files: RuntimeSourceFile[];
  entrypoint: string;
  spec: TaskValidationSpec;
}): Promise<TaskValidationResult> {
  const check = input.spec.checks.find(
    (candidate): candidate is AsyncProgrammingCheck => candidate.kind === "async_programming",
  );
  if (!check) {
    throw new Error("Async programlama kalite kapısı bulunamadı.");
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
    throw new Error("Async programlama doğrulama motoru sonuç döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(diagnostic || runtimeMessage || "Async programlama doğrulayıcısı çalıştırılamadı.");
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
