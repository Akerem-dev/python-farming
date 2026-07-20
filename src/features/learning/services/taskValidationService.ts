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


def collect_target(target):
    if isinstance(target, ast.Name):
        assigned_names.add(target.id)
    elif isinstance(target, (ast.Tuple, ast.List)):
        for element in target.elts:
            collect_target(element)


if tree is not None:
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                collect_target(target)
        elif isinstance(node, ast.AnnAssign):
            collect_target(node.target)
        elif isinstance(node, ast.NamedExpr):
            collect_target(node.target)
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                called_names.add(node.func.id)
            elif isinstance(node.func, ast.Attribute):
                called_names.add(node.func.attr)

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
    elif runtime_error is not None:
        passed = False
        message = "Kod çalışırken bir Python hatası oluştu."
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
