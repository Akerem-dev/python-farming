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


def module_name_for(path):
    return path[:-3].replace("/", ".")


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

namespace = {"__name__": "__main__"}
stdout_buffer = io.StringIO()
stderr_buffer = io.StringIO()
runtime_error = None
if not syntax_errors:
    sys.path.insert(0, os.getcwd())
    try:
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            namespace = runpy.run_path(entrypoint, run_name="__main__")
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

    results.append(
        item(
            check,
            not failures,
            "Decorator ve context manager sözleşmeleri doğru."
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
    throw new Error("Decorator ve context manager kalite kapısı bulunamadı.");
  }

  const validatorFile: RuntimeSourceFile = {
    path: VALIDATOR_PATH,
    content: VALIDATOR_SOURCE,
  };
  const result: ExecuteCodeResult = await runtimeClient.executeProject({
    version: runtimeProtocolVersion,
    requestId: createRequestId(),
    command: "execute_code",
    payload: {
      source: VALIDATOR_SOURCE,
      filename: VALIDATOR_PATH,
      files: [validatorFile, ...input.files],
      entrypoint: VALIDATOR_PATH,
      stdin: [
        JSON.stringify({
          files: [VALIDATOR_PATH, ...input.files.map((file) => file.path)],
          entrypoint: input.entrypoint,
          spec: input.spec,
        }),
      ],
      timeoutMs: input.spec.timeoutMs,
    },
  });

  if (result.timedOut) {
    throw new Error("Decorator/context manager doğrulaması zaman aşımına uğradı.");
  }
  if (result.runtimeError || result.exitCode !== 0) {
    throw new Error(result.runtimeError ?? result.stderr ?? "İleri seviye doğrulayıcı çalıştırılamadı.");
  }
  return parseTaskValidationOutput(result.stdout);
}
