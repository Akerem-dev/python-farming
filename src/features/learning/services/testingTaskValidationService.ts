import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeSourceFile,
} from "../../../runtime/runtimeProtocol";
import type { TaskValidationSpec } from "../taskValidationTypes";
import { parseTaskValidationOutput } from "./taskValidationService";

const VALIDATOR_PATH = "__python_farming_testing_validator__.py";

const VALIDATOR_SOURCE = String.raw`
import ast
import importlib
import json
import os
import re
import runpy
import sys
import time
import types

payload = json.loads(sys.stdin.read())
file_paths = payload["files"]
spec = payload["spec"]
started_at = time.perf_counter()
sys.dont_write_bytecode = True


def dotted_name(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = dotted_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return None


def exception_name(node):
    return dotted_name(node)


def regex_matches(pattern, value):
    return re.search(pattern, str(value), re.IGNORECASE) is not None


class RaisesContext:
    def __init__(self, expected, match=None):
        self.expected = expected
        self.match = match
        self.value = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        if exc is None:
            raise AssertionError(f"{getattr(self.expected, '__name__', self.expected)} fırlatılmadı")
        expected = self.expected if isinstance(self.expected, tuple) else (self.expected,)
        if not any(isinstance(exc, item) for item in expected):
            return False
        if self.match and not regex_matches(self.match, exc):
            raise AssertionError(f"Hata mesajı eşleşmedi: {exc}")
        self.value = exc
        return True


class MarkProxy:
    def parametrize(self, names, cases):
        parameter_names = [name.strip() for name in names.split(",")] if isinstance(names, str) else list(names)
        case_list = list(cases)

        def decorator(function):
            existing = list(getattr(function, "__pf_parametrize__", []))
            existing.append((parameter_names, case_list))
            function.__pf_parametrize__ = existing
            return function

        return decorator


def install_pytest_shim():
    module = types.ModuleType("pytest")
    module.raises = lambda expected, match=None: RaisesContext(expected, match)
    module.mark = MarkProxy()
    sys.modules["pytest"] = module


def project_module_names():
    root = os.path.realpath(os.getcwd())
    names = []
    for name, module in list(sys.modules.items()):
        path = getattr(module, "__file__", None)
        if not path:
            continue
        try:
            if os.path.realpath(path).startswith(root + os.sep):
                names.append(name)
        except (OSError, TypeError):
            continue
    return names


def clear_project_modules():
    for name in project_module_names():
        if name != "pytest":
            sys.modules.pop(name, None)
    importlib.invalidate_caches()


def expand_parameter_sets(function):
    parameter_sets = getattr(function, "__pf_parametrize__", [])
    if not parameter_sets:
        return [({}, "")]

    expanded = [({}, "")]
    for names, cases in parameter_sets:
        next_expanded = []
        for existing_kwargs, existing_label in expanded:
            for index, case in enumerate(cases, start=1):
                values = list(case) if isinstance(case, (tuple, list)) else [case]
                if len(values) != len(names):
                    raise AssertionError("Parametrize isim ve değer sayısı eşleşmiyor")
                kwargs = dict(existing_kwargs)
                kwargs.update(dict(zip(names, values)))
                label = f"{existing_label} param-{index}".strip()
                next_expanded.append((kwargs, label))
        expanded = next_expanded
    return expanded


def run_test_suite(test_files):
    clear_project_modules()
    install_pytest_shim()
    discovered = []
    failures = []

    for path in test_files:
        try:
            namespace = runpy.run_path(path, run_name=f"__pf_tests_{path.replace('/', '_')}")
        except BaseException as error:
            failures.append(f"{path} yüklenemedi: {type(error).__name__}: {error}")
            continue

        for name, candidate in namespace.items():
            if name.startswith("test_") and callable(candidate):
                discovered.append((path, name, candidate))

    for path, name, function in discovered:
        try:
            parameter_sets = expand_parameter_sets(function)
        except BaseException as error:
            failures.append(f"{path}::{name}: {type(error).__name__}: {error}")
            continue

        for kwargs, label in parameter_sets:
            case_name = f"{path}::{name}{'[' + label + ']' if label else ''}"
            try:
                function(**kwargs)
            except BaseException as error:
                failures.append(f"{case_name}: {type(error).__name__}: {error}")

    return {
        "passed": bool(discovered) and not failures,
        "testCount": len(discovered),
        "executedCount": sum(
            max(1, len(expand_parameter_sets(function)))
            for _, _, function in discovered
        ) if discovered else 0,
        "failures": failures,
    }


def inspect_test_structure(test_files):
    test_count = 0
    assert_count = 0
    parametrize_cases = 0
    raises_types = set()
    syntax_errors = []

    for path in test_files:
        try:
            source = open(path, "r", encoding="utf-8").read()
            tree = ast.parse(source, filename=path, mode="exec")
        except (OSError, UnicodeError, SyntaxError) as error:
            syntax_errors.append(f"{path}: {error}")
            continue

        test_count += sum(
            1
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_")
        )
        assert_count += sum(1 for node in ast.walk(tree) if isinstance(node, ast.Assert))

        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and dotted_name(node.func) == "pytest.raises" and node.args:
                name = exception_name(node.args[0])
                if name:
                    raises_types.add(name.split(".")[-1])

        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call) or dotted_name(decorator.func) != "pytest.mark.parametrize":
                    continue
                if len(decorator.args) >= 2 and isinstance(decorator.args[1], (ast.List, ast.Tuple)):
                    parametrize_cases += len(decorator.args[1].elts)

    return {
        "testCount": test_count,
        "assertCount": assert_count,
        "parametrizeCases": parametrize_cases,
        "raisesTypes": raises_types,
        "syntaxErrors": syntax_errors,
    }


def result_item(identifier, label, visibility, passed, message):
    return {
        "id": identifier,
        "label": label,
        "visibility": visibility,
        "passed": bool(passed),
        "message": message,
    }


results = []
stdout_lines = []

for check in spec.get("checks", []):
    if check.get("kind") != "test_suite":
        results.append(result_item(
            check.get("id", "unsupported"),
            check.get("label", "Desteklenmeyen test"),
            check.get("visibility", "visible"),
            False,
            f"Test doğrulayıcısında desteklenmeyen kontrol türü: {check.get('kind')}",
        ))
        continue

    test_files = check.get("testFiles", [])
    structure = inspect_test_structure(test_files)
    required_raises = set(check.get("requireRaises", []))
    missing_raises = sorted(required_raises - structure["raisesTypes"])
    structure_ok = (
        not structure["syntaxErrors"]
        and structure["testCount"] >= int(check.get("minTests", 1))
        and structure["assertCount"] >= int(check.get("minAssertions", 1))
        and structure["parametrizeCases"] >= int(check.get("minParametrizeCases", 0))
        and not missing_raises
    )
    structure_message = (
        f"{structure['testCount']} test fonksiyonu, {structure['assertCount']} assert ve "
        f"{structure['parametrizeCases']} parametrik senaryo bulundu."
    )
    if structure["syntaxErrors"]:
        structure_message = structure["syntaxErrors"][0]
    elif missing_raises:
        structure_message = f"Eksik pytest.raises türleri: {', '.join(missing_raises)}."
    elif not structure_ok:
        structure_message = "Test paketi gerekli test, assert veya parametrik senaryo sayısını karşılamıyor."

    results.append(result_item(
        f"{check['id']}-structure",
        "Test paketi yapısı",
        "visible",
        structure_ok,
        structure_message,
    ))

    baseline = run_test_suite(test_files) if structure_ok else {
        "passed": False,
        "testCount": 0,
        "executedCount": 0,
        "failures": ["Test yapısı geçersiz."],
    }
    baseline_message = (
        f"Doğru uygulamada {baseline['executedCount']} test senaryosu geçti."
        if baseline["passed"]
        else (baseline["failures"][0] if baseline["failures"] else "Test paketi çalışmadı.")
    )
    results.append(result_item(
        f"{check['id']}-baseline",
        "Doğru uygulama testleri",
        "visible",
        baseline["passed"],
        baseline_message,
    ))
    stdout_lines.append(baseline_message)

    for mutant in check.get("mutants", []):
        target = mutant.get("file")
        source = mutant.get("source")
        caught = False
        message = "Mutant uygulama testler tarafından yakalanmadı."
        original = None
        try:
            with open(target, "r", encoding="utf-8") as target_file:
                original = target_file.read()
            with open(target, "w", encoding="utf-8") as target_file:
                target_file.write(source)
            mutant_run = run_test_suite(test_files)
            caught = not mutant_run["passed"]
            if caught:
                message = "Gizli hatalı uygulama en az bir test tarafından yakalandı."
        except BaseException as error:
            message = f"Mutant senaryosu çalıştırılamadı: {type(error).__name__}: {error}"
        finally:
            if original is not None:
                with open(target, "w", encoding="utf-8") as target_file:
                    target_file.write(original)
                clear_project_modules()

        results.append(result_item(
            f"{check['id']}-mutant-{mutant.get('id', 'case')}",
            mutant.get("label", "Gizli hata yakalama testi"),
            "hidden",
            caught,
            message,
        ))

passed_count = sum(1 for item in results if item["passed"])
total_count = len(results)
score = round((passed_count / total_count) * 100) if total_count else 0
result = {
    "taskId": spec["id"],
    "passed": total_count > 0 and passed_count == total_count,
    "score": score,
    "checks": results,
    "stdout": "\n".join(stdout_lines),
    "stderr": "",
    "runtimeError": None,
    "durationMs": round((time.perf_counter() - started_at) * 1000),
}
print(json.dumps(result, ensure_ascii=False))
`;

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `testing-validation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function validateTestingTask(options: {
  files: RuntimeSourceFile[];
  entrypoint: string;
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
          spec: options.spec,
        }),
      ],
      timeoutMs: options.spec.timeoutMs,
    },
  });

  if (!response.payload) {
    throw new Error("Test doğrulama motoru sonuç verisi döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(diagnostic || runtimeMessage || "Test doğrulama motoru çalıştırılamadı.");
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
