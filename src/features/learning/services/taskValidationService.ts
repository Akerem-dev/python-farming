import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
} from "../../../runtime/runtimeProtocol";
import type {
  TaskValidationResult,
  TaskValidationSpec,
} from "../taskValidationTypes";

const VALIDATOR_SOURCE = String.raw`
import ast
import contextlib
import io
import json
import re
import sys
import time
import traceback

payload = json.loads(sys.stdin.read())
source = payload["source"]
filename = payload.get("filename", "main.py")
stdin_lines = payload.get("stdin", [])
spec = payload["spec"]
started_at = time.perf_counter()

syntax_error = None
tree = None
try:
    tree = ast.parse(source, filename=filename, mode="exec")
except SyntaxError as error:
    line = error.lineno or 0
    syntax_error = f"{error.msg} (satır {line})"

assigned_names = set()
called_names = set()
called_counts = {}
node_counts = {}
function_definitions = {}


def collect_target(target):
    if isinstance(target, ast.Name):
        assigned_names.add(target.id)
    elif isinstance(target, (ast.Tuple, ast.List)):
        for element in target.elts:
            collect_target(element)


def collect_call(name):
    called_names.add(name)
    called_counts[name] = called_counts.get(name, 0) + 1


if tree is not None:
    for node in ast.walk(tree):
        node_name = type(node).__name__
        node_counts[node_name] = node_counts.get(node_name, 0) + 1

        if isinstance(node, ast.Assign):
            for target in node.targets:
                collect_target(target)
        elif isinstance(node, ast.AnnAssign):
            collect_target(node.target)
        elif isinstance(node, ast.NamedExpr):
            collect_target(node.target)
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                collect_call(node.func.id)
            elif isinstance(node.func, ast.Attribute):
                collect_call(node.func.attr)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            positional_count = len(node.args.posonlyargs) + len(node.args.args)
            keyword_only_count = len(node.args.kwonlyargs)
            variadic_count = int(node.args.vararg is not None) + int(node.args.kwarg is not None)
            default_count = len(node.args.defaults) + sum(
                1 for default in node.args.kw_defaults if default is not None
            )
            returns_value = any(
                isinstance(child, ast.Return) and child.value is not None
                for child in ast.walk(node)
            )
            function_definitions[node.name] = {
                "parameterCount": positional_count + keyword_only_count + variadic_count,
                "defaultCount": default_count,
                "returnsValue": returns_value,
            }

namespace = {"__name__": "__main__"}
stdout_buffer = io.StringIO()
stderr_buffer = io.StringIO()
runtime_error = None

if tree is not None:
    previous_stdin = sys.stdin
    input_text = "\n".join(stdin_lines)
    if input_text and not input_text.endswith("\n"):
        input_text += "\n"
    sys.stdin = io.StringIO(input_text)

    try:
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            exec(compile(tree, filename, "exec"), namespace, namespace)
    except BaseException:
        runtime_error = traceback.format_exc()
    finally:
        sys.stdin = previous_stdin

stdout = stdout_buffer.getvalue()
stderr = stderr_buffer.getvalue()
results = []


def check_result(check, passed, message):
    return {
        "id": check["id"],
        "label": check["label"],
        "visibility": check["visibility"],
        "passed": bool(passed),
        "message": message,
    }


def count_message(label, count, minimum, maximum):
    if maximum is not None and minimum == maximum:
        return f"{label} tam {minimum} kez bulunmalı; bulunan: {count}."
    if maximum is not None:
        return f"{label} {minimum} ile {maximum} kez bulunmalı; bulunan: {count}."
    return f"{label} en az {minimum} kez bulunmalı; bulunan: {count}."


for check in spec.get("checks", []):
    kind = check.get("kind")

    if syntax_error is not None:
        results.append(check_result(check, False, f"Sözdizimi hatası: {syntax_error}"))
        continue

    if kind == "assignment":
        name = check["name"]
        passed = name in assigned_names
        message = f"{name} değişkeni bulundu." if passed else f"{name} değişkeni tanımlanmadı."
    elif kind == "call":
        name = check["name"]
        passed = name in called_names
        message = f"{name}() çağrısı bulundu." if passed else f"{name}() kullanılmadı."
    elif kind == "call_count":
        name = check["name"]
        minimum = int(check.get("min", 0))
        maximum = check.get("max")
        maximum = int(maximum) if maximum is not None else None
        count = called_counts.get(name, 0)
        passed = count >= minimum and (maximum is None or count <= maximum)
        message = (
            f"{name}() çağrı sayısı doğru: {count}."
            if passed
            else count_message(f"{name}()", count, minimum, maximum)
        )
    elif kind == "node_count":
        node_name = check["nodeName"]
        minimum = int(check.get("min", 0))
        maximum = check.get("max")
        maximum = int(maximum) if maximum is not None else None
        count = node_counts.get(node_name, 0)
        passed = count >= minimum and (maximum is None or count <= maximum)
        message = (
            f"{node_name} yapısı bulundu: {count}."
            if passed
            else count_message(node_name, count, minimum, maximum)
        )
    elif kind == "function_definition":
        name = check["name"]
        definition = function_definitions.get(name)
        minimum_params = int(check.get("minParams", 0))
        maximum_params = check.get("maxParams")
        maximum_params = int(maximum_params) if maximum_params is not None else None
        minimum_defaults = int(check.get("minDefaults", 0))
        maximum_defaults = check.get("maxDefaults")
        maximum_defaults = int(maximum_defaults) if maximum_defaults is not None else None
        require_return = bool(check.get("requireReturn", False))

        if definition is None:
            passed = False
            message = f"{name} adlı fonksiyon tanımlanmadı."
        else:
            parameter_count = definition["parameterCount"]
            default_count = definition["defaultCount"]
            parameter_ok = parameter_count >= minimum_params and (
                maximum_params is None or parameter_count <= maximum_params
            )
            default_ok = default_count >= minimum_defaults and (
                maximum_defaults is None or default_count <= maximum_defaults
            )
            return_ok = not require_return or definition["returnsValue"]
            passed = parameter_ok and default_ok and return_ok

            if not parameter_ok:
                message = count_message(
                    f"{name}() parametre sayısı",
                    parameter_count,
                    minimum_params,
                    maximum_params,
                )
            elif not default_ok:
                message = count_message(
                    f"{name}() varsayılan parametre sayısı",
                    default_count,
                    minimum_defaults,
                    maximum_defaults,
                )
            elif not return_ok:
                message = f"{name}() fonksiyonu bir değer return etmelidir."
            else:
                message = (
                    f"{name}() imzası doğru: {parameter_count} parametre, "
                    f"{default_count} varsayılan değer."
                )
    elif runtime_error is not None:
        passed = False
        message = "Kod çalışırken bir Python hatası oluştu."
    elif kind == "function_cases":
        name = check["name"]
        function = namespace.get(name)
        cases = check.get("cases", [])
        passed = callable(function) and len(cases) > 0
        message = f"{name}() gizli çağrı testleri geçti."

        if not callable(function):
            passed = False
            message = f"{name} çalıştırılabilir bir fonksiyon değil."
        elif not cases:
            passed = False
            message = "Fonksiyon için gizli çağrı senaryosu tanımlanmamış."
        else:
            for index, case in enumerate(cases, start=1):
                try:
                    case_stdout = io.StringIO()
                    case_stderr = io.StringIO()
                    with contextlib.redirect_stdout(case_stdout), contextlib.redirect_stderr(case_stderr):
                        actual = function(*case.get("args", []))
                except BaseException as error:
                    passed = False
                    message = f"Gizli senaryo {index} hata verdi: {type(error).__name__}."
                    break

                expected = case.get("expected")
                if actual != expected:
                    passed = False
                    message = (
                        f"Gizli senaryo {index} beklenen değeri döndürmedi "
                        f"(beklenen: {expected!r}, dönen: {actual!r})."
                    )
                    break
    elif kind == "variable_type":
        name = check["name"]
        expected_type = check["expectedType"]
        value = namespace.get(name)
        passed = name in namespace and type(value).__name__ == expected_type
        message = "Değişken türü doğru." if passed else "Değişken beklenen türde değil."
    elif kind == "variable_non_empty":
        name = check["name"]
        value = namespace.get(name)
        passed = name in namespace and bool(value)
        message = "Değişken boş değil." if passed else "Değişken boş bırakılamaz."
    elif kind == "variable_positive":
        name = check["name"]
        value = namespace.get(name)
        passed = (
            name in namespace
            and isinstance(value, (int, float))
            and not isinstance(value, bool)
            and value > 0
        )
        message = "Sayısal değer pozitif." if passed else "Değer sıfırdan büyük olmalı."
    elif kind == "stdout_regex":
        flags_text = check.get("flags", "")
        flags = 0
        if "i" in flags_text:
            flags |= re.IGNORECASE
        if "m" in flags_text:
            flags |= re.MULTILINE
        if "s" in flags_text:
            flags |= re.DOTALL
        passed = re.search(check["pattern"], stdout, flags) is not None
        message = "Program çıktısı beklenen biçimde." if passed else "Program çıktısı beklenen biçimle eşleşmedi."
    else:
        passed = False
        message = f"Desteklenmeyen kontrol türü: {kind}"

    results.append(check_result(check, passed, message))

passed_count = sum(1 for item in results if item["passed"])
total_count = len(results)
score = round((passed_count / total_count) * 100) if total_count else 0
result = {
    "taskId": spec["id"],
    "passed": total_count > 0 and passed_count == total_count and runtime_error is None,
    "score": score,
    "checks": results,
    "stdout": stdout,
    "stderr": stderr,
    "runtimeError": runtime_error,
    "durationMs": round((time.perf_counter() - started_at) * 1000),
}

print(json.dumps(result, ensure_ascii=False))
`;

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `validation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function splitStdinText(value: string) {
  if (value.length === 0) {
    return [];
  }

  return value.replace(/\r\n/g, "\n").split("\n");
}

export function parseTaskValidationOutput(output: string): TaskValidationResult {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error("Görev doğrulama motoru boş sonuç döndürdü.");
  }

  const parsed = JSON.parse(trimmed) as Partial<TaskValidationResult>;
  if (
    typeof parsed.taskId !== "string" ||
    typeof parsed.passed !== "boolean" ||
    typeof parsed.score !== "number" ||
    !Array.isArray(parsed.checks)
  ) {
    throw new Error("Görev doğrulama sonucu beklenen biçimde değil.");
  }

  return parsed as TaskValidationResult;
}

export function validateChoiceAnswer(
  spec: TaskValidationSpec,
  selectedOptionId: string | null,
): TaskValidationResult {
  if (!spec.answer || spec.answer.kind !== "choice") {
    throw new Error("Bu görev seçim tabanlı bir cevap doğrulaması içermiyor.");
  }

  const hasSelection = Boolean(selectedOptionId);
  const isCorrect = selectedOptionId === spec.answer.correctOptionId;
  const checks = [
    {
      id: "choice-selected",
      label: "Bir tahmin seçildi",
      visibility: "visible" as const,
      passed: hasSelection,
      message: hasSelection ? "Tahminin kaydedildi." : "Önce seçeneklerden birini seçmelisin.",
    },
    {
      id: "choice-correct",
      label: "Gizli cevap kontrolü",
      visibility: "hidden" as const,
      passed: isCorrect,
      message: isCorrect ? "Tahmin doğru." : "Tahmin beklenen çıktıyla eşleşmedi.",
    },
  ];
  const passedCount = checks.filter((check) => check.passed).length;

  return {
    taskId: spec.id,
    passed: hasSelection && isCorrect,
    score: Math.round((passedCount / checks.length) * 100),
    checks,
    stdout: "",
    stderr: "",
    runtimeError: null,
    durationMs: 0,
  };
}

export async function validateTaskSource(options: {
  source: string;
  filename: string;
  stdin: string[];
  spec: TaskValidationSpec;
}) {
  const response = await runtimeClient.send<ExecuteCodeResult>({
    requestId: createRequestId(),
    protocolVersion: runtimeProtocolVersion,
    kind: "execute_code",
    payload: {
      source: VALIDATOR_SOURCE,
      filename: "__python_farming_validator__.py",
      stdin: [
        JSON.stringify({
          source: options.source,
          filename: options.filename,
          stdin: options.stdin,
          spec: options.spec,
        }),
      ],
      timeoutMs: options.spec.timeoutMs,
    },
  });

  if (!response.payload) {
    throw new Error("Görev doğrulama motoru sonuç verisi döndürmedi.");
  }

  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(diagnostic || runtimeMessage || "Görev doğrulama motoru çalıştırılamadı.");
  }

  return parseTaskValidationOutput(response.payload.stdout);
}
