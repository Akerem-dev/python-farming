import { runtimeClient } from "../../../runtime/runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeSourceFile,
} from "../../../runtime/runtimeProtocol";
import type { TaskValidationSpec } from "../taskValidationTypes";
import { parseTaskValidationOutput } from "./taskValidationService";

const VALIDATOR_PATH = "__python_farming_capstone_validator__.py";

const VALIDATOR_SOURCE = String.raw`
import ast
import contextlib
import dataclasses
import importlib
import inspect
import io
import json
import os
import re
import runpy
import sys
import tempfile
import time
import traceback
import typing
from datetime import date
from decimal import Decimal
from enum import Enum

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


def regex_flags(text):
    flags = 0
    if "i" in text:
        flags |= re.IGNORECASE
    if "m" in text:
        flags |= re.MULTILINE
    if "s" in text:
        flags |= re.DOTALL
    return flags


def class_info(path, name):
    tree = trees.get(path)
    if tree is None:
        return None
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == name:
            methods = {
                child.name
                for child in node.body
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
            }
            fields = {
                child.target.id
                for child in node.body
                if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name)
            }
            bases = {
                ast.unparse(base).split(".")[-1]
                for base in node.bases
            }
            decorators = {
                ast.unparse(decorator).split("(")[0].split(".")[-1]
                for decorator in node.decorator_list
            }
            return {
                "methods": methods,
                "fields": fields,
                "bases": bases,
                "decorators": decorators,
            }
    return None


def function_node(path, name):
    tree = trees.get(path)
    if tree is None:
        return None
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    return None


def function_is_typed(path, name):
    node = function_node(path, name)
    if node is None or node.returns is None:
        return False
    parameters = list(node.args.posonlyargs) + list(node.args.args) + list(node.args.kwonlyargs)
    return all(argument.annotation is not None for argument in parameters)


def count_tests(test_files):
    tests = []
    assertions = 0
    for path in test_files:
        tree = trees.get(path)
        if tree is None:
            continue
        assertions += sum(1 for node in ast.walk(tree) if isinstance(node, ast.Assert))
        tests.extend(
            (path, node.name)
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name.startswith("test_")
            and len(node.args.args) == 0
        )
    return tests, assertions


def run_student_tests(test_functions):
    for path, name in test_functions:
        namespace = runpy.run_path(path, run_name=f"__python_farming_test_{name}__")
        target = namespace.get(name)
        if not callable(target):
            return False, f"{path} içindeki {name} çalıştırılabilir değil."
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                target()
        except BaseException as error:
            return False, f"{name} başarısız oldu: {type(error).__name__}: {error}"
    return True, "Öğrencinin test paketi doğru uygulamada geçti."


def check_capstone(check):
    missing_files = [path for path in check.get("requiredFiles", []) if not os.path.isfile(path)]
    if missing_files:
        return False, f"Eksik proje dosyaları: {', '.join(missing_files)}."
    if syntax_errors:
        path, error = next(iter(syntax_errors.items()))
        return False, f"{path} sözdizimi hatası: {error}"

    required_classes = [
        ("models.py", "SiparisKalemi", {"ad", "birim_fiyat", "adet"}, {"toplam"}),
        ("models.py", "Siparis", {"siparis_id", "musteri", "tarih", "kalemler", "durum"}, {"toplam"}),
        ("repository.py", "JsonSiparisDeposu", set(), {"yukle", "kaydet"}),
    ]
    for path, name, fields, methods in required_classes:
        info = class_info(path, name)
        if info is None:
            return False, f"{path} içinde {name} sınıfı bulunamadı."
        if fields - info["fields"]:
            return False, f"{name} alanları eksik: {', '.join(sorted(fields - info['fields']))}."
        if methods - info["methods"]:
            return False, f"{name} metotları eksik: {', '.join(sorted(methods - info['methods']))}."

    enum_info = class_info("models.py", "SiparisDurumu")
    if enum_info is None or "Enum" not in enum_info["bases"]:
        return False, "SiparisDurumu gerçek bir Enum olmalıdır."

    error_info = class_info("errors.py", "VeriHatasi")
    if error_info is None or "Exception" not in error_info["bases"]:
        return False, "VeriHatasi Exception tabanından türemelidir."

    for path, name in [
        ("service.py", "siparis_olustur"),
        ("service.py", "siparisi_sozluge"),
        ("reporting.py", "haftalik_rapor"),
    ]:
        if not function_is_typed(path, name):
            return False, f"{path} içindeki {name} tamamen tiplendirilmelidir."

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
        models = importlib.import_module("models")
        errors = importlib.import_module("errors")
        repository = importlib.import_module("repository")
        service = importlib.import_module("service")
        reporting = importlib.import_module("reporting")

        if not dataclasses.is_dataclass(models.SiparisKalemi):
            return False, "SiparisKalemi gerçek bir dataclass olmalıdır."
        if not dataclasses.is_dataclass(models.Siparis):
            return False, "Siparis gerçek bir dataclass olmalıdır."
        if not issubclass(models.SiparisDurumu, Enum):
            return False, "SiparisDurumu çalışma zamanında Enum değildir."
        if {member.value for member in models.SiparisDurumu} != {"taslak", "tamamlandi"}:
            return False, "SiparisDurumu üyeleri taslak ve tamamlandi değerlerini taşımalıdır."
        if not issubclass(errors.VeriHatasi, Exception):
            return False, "VeriHatasi çalışma zamanında Exception değildir."

        for target in [
            service.siparis_olustur,
            service.siparisi_sozluge,
            reporting.haftalik_rapor,
            models.SiparisKalemi.toplam,
            models.Siparis.toplam,
        ]:
            hints = typing.get_type_hints(target)
            if "return" not in hints:
                return False, f"{target.__name__} dönüş type hint'i taşımıyor."

        raw = {
            "siparis_id": "H-001",
            "musteri": "Ada",
            "tarih": "2026-07-20",
            "durum": "tamamlandi",
            "kalemler": [
                {"ad": "Kalem", "birim_fiyat": "15.50", "adet": 2},
                {"ad": "Defter", "birim_fiyat": "45.00", "adet": 1},
            ],
        }
        order = service.siparis_olustur(raw)
        if not isinstance(order, models.Siparis):
            return False, "siparis_olustur() Siparis nesnesi döndürmelidir."
        if order.toplam() != Decimal("76.00"):
            return False, "Sipariş toplamı Decimal ile doğru hesaplanmadı."
        serialized = service.siparisi_sozluge(order)
        if serialized.get("toplam") != "76.00":
            return False, "siparisi_sozluge() toplamı iki ondalıklı metin olarak vermelidir."

        invalid = dict(raw)
        invalid["kalemler"] = [{"ad": "Kalem", "birim_fiyat": "15.50", "adet": 0}]
        try:
            service.siparis_olustur(invalid)
            return False, "Geçersiz adet VeriHatasi üretmelidir."
        except errors.VeriHatasi:
            pass

        report = reporting.haftalik_rapor([order], "2026-07-23", 7)
        expected_report = {
            "baslangic": "2026-07-17",
            "bitis": "2026-07-23",
            "siparis_sayisi": 1,
            "toplam": "76.00",
            "musteriler": ["Ada"],
            "durum": "hazir",
        }
        if report != expected_report:
            return False, f"Gizli haftalık rapor sözleşmesi bozuldu: {report!r}."
        empty_report = reporting.haftalik_rapor([], "2026-07-23", 7)
        if empty_report.get("durum") != "bos" or empty_report.get("toplam") != "0.00":
            return False, "Boş rapor durumu güvenli biçimde işlenmelidir."

        with tempfile.TemporaryDirectory(prefix="python-farming-capstone-") as directory:
            path = os.path.join(directory, "orders.json")
            store = repository.JsonSiparisDeposu(path)
            payload_value = [{"id": 1, "ad": "Test"}]
            store.kaydet(payload_value)
            if store.yukle() != payload_value:
                return False, "JsonSiparisDeposu kaydet/yükle çevrimi veriyi korumuyor."
    except BaseException as error:
        return False, f"Gizli proje senaryosu hata verdi: {type(error).__name__}: {error}"

    return True, "Domain modeli, JSON kalıcılığı, test paketi ve gizli proje senaryoları geçti."


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
    if kind == "capstone_project":
        if runtime_error is not None:
            passed = False
            message = "Bitirme projesi çalışırken yakalanmamış bir Python hatası oluştu."
        else:
            passed, message = check_capstone(check)
    elif kind == "file_exists":
        passed = os.path.isfile(check["path"])
        message = "Beklenen dosya üretildi." if passed else f"{check['path']} dosyası üretilmedi."
    elif kind == "file_unchanged":
        path = check["path"]
        try:
            passed = open(path, "r", encoding="utf-8").read() == sources.get(path)
        except (OSError, UnicodeError):
            passed = False
        message = "Kaynak veri değiştirilmedi." if passed else f"{path} kaynak verisi değiştirilmemelidir."
    elif kind == "json_file_equals":
        try:
            actual = json.load(open(check["path"], "r", encoding="utf-8"))
            passed = actual == check.get("expected")
        except (OSError, UnicodeError, json.JSONDecodeError):
            passed = False
        message = "JSON çıktısı beklenen sözleşmeye uyuyor." if passed else f"{check['path']} JSON çıktısı eşleşmedi."
    elif kind == "stdout_regex":
        passed = re.search(check["pattern"], stdout, regex_flags(check.get("flags", ""))) is not None
        message = "Terminal çıktısı beklenen biçimde." if passed else "Terminal çıktısı beklenen biçimle eşleşmedi."
    else:
        passed = False
        message = f"Bitirme projesi doğrulayıcısında desteklenmeyen kontrol türü: {kind}"
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
  return `capstone-validation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function validateCapstoneTask(options: {
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
    throw new Error("Bitirme projesi doğrulama motoru sonuç verisi döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(
      diagnostic || runtimeMessage || "Bitirme projesi doğrulama motoru çalıştırılamadı.",
    );
  }
  return parseTaskValidationOutput(response.payload.stdout);
}
