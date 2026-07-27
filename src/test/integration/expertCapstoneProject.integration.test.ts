import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";
import type {
  TaskValidationResult,
  TaskValidationSpec,
} from "../../features/learning/taskValidationTypes";

const workspaces: string[] = [];
const validatorFilename = "__python_farming_project_validator__.py";

function validatorSource() {
  const source = readFileSync(
    resolve(process.cwd(), "src/features/learning/services/projectTaskValidationService.ts"),
    "utf-8",
  );
  const match = source.match(
    /const PROJECT_VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) throw new Error("Project validator source could not be extracted.");
  return match[1].replace(
    "${JSON.stringify(PROJECT_VALIDATOR_PATH)}",
    JSON.stringify(validatorFilename),
  );
}

function finalSpec() {
  const modulePackage = JSON.parse(
    readFileSync(resolve(process.cwd(), "public/content/modules/expert-project.json"), "utf-8"),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find(
    (candidate) => candidate.id === "expert.project.reliable-code-platform",
  );
  if (!lesson) throw new Error("Expert capstone lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-expert-capstone-"));
  workspaces.push(workspace);
  writeFileSync(join(workspace, validatorFilename), validatorSource(), "utf-8");
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(workspace, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }
  const execution = spawnSync("python3", [validatorFilename], {
    cwd: workspace,
    input: JSON.stringify({
      files: [validatorFilename, ...Object.keys(files)],
      entrypoint: "main.py",
      stdin: [],
      spec,
    }),
    encoding: "utf-8",
    timeout: 20_000,
  });
  if (execution.status !== 0) {
    throw new Error(
      execution.stderr || execution.error?.message || "Expert capstone validator failed.",
    );
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

const referenceFiles = {
  "main.py": `from kod_platformu import analiz_raporu


if __name__ == "__main__":
    print(analiz_raporu([
        {"path": "a.py", "source": "token = 'abc'\\nresult = eval('1+1')\\n"},
    ]))
`,
  "kod_platformu/__init__.py": `from .report import analiz_raporu

__all__ = ["analiz_raporu"]
`,
  "kod_platformu/models.py": `from dataclasses import dataclass


@dataclass(frozen=True)
class KaynakDosya:
    path: str
    source: str
`,
  "kod_platformu/registry.py": `KURALLAR = {}


def kontrol_kaydi(ad):
    def decorator(fonksiyon):
        KURALLAR[ad] = fonksiyon
        return fonksiyon

    return decorator
`,
  "kod_platformu/security.py": `import ast

from .registry import kontrol_kaydi

HASSAS_PARÇALAR = ("password", "token", "secret", "api_key", "authorization")
GUVENSIZ_CAGRILAR = {"eval", "exec", "system", "popen"}


def _hedef_adi(hedef):
    if isinstance(hedef, ast.Name):
        return hedef.id
    if isinstance(hedef, ast.Attribute):
        return hedef.attr
    return ""


@kontrol_kaydi("secret_assignment")
def gizli_atamalar(tree, path):
    bulgular = []
    for dugum in ast.walk(tree):
        if isinstance(dugum, ast.Assign):
            hedefler = dugum.targets
        elif isinstance(dugum, (ast.AnnAssign, ast.AugAssign)):
            hedefler = [dugum.target]
        else:
            continue
        for hedef in hedefler:
            ad = _hedef_adi(hedef)
            if ad and any(parca in ad.lower() for parca in HASSAS_PARÇALAR):
                bulgular.append({
                    "path": path,
                    "kind": "secret_assignment",
                    "name": ad,
                    "line": dugum.lineno,
                })
    return bulgular


@kontrol_kaydi("unsafe_call")
def guvensiz_cagrilar(tree, path):
    bulgular = []
    for dugum in ast.walk(tree):
        if not isinstance(dugum, ast.Call):
            continue
        if isinstance(dugum.func, ast.Name):
            ad = dugum.func.id
        elif isinstance(dugum.func, ast.Attribute):
            ad = dugum.func.attr
        else:
            ad = ""
        if ad in GUVENSIZ_CAGRILAR:
            bulgular.append({
                "path": path,
                "kind": "unsafe_call",
                "name": ad,
                "line": dugum.lineno,
            })
    return bulgular
`,
  "kod_platformu/analyzer.py": `import ast

from . import security
from .registry import KURALLAR

KARMASIKLIK_DUGUMLERI = (
    ast.If,
    ast.For,
    ast.While,
    ast.Try,
    ast.With,
    ast.BoolOp,
    ast.ListComp,
    ast.SetComp,
    ast.DictComp,
    ast.GeneratorExp,
)


def dosya_analizi(dosya):
    try:
        tree = ast.parse(dosya.source)
    except SyntaxError:
        return {
            "path": dosya.path,
            "error": "SyntaxError",
            "bulgular": [],
            "karmasiklik": 0,
        }

    bulgular = []
    for ad in sorted(KURALLAR):
        bulgular.extend(KURALLAR[ad](tree, dosya.path))
    karmasiklik = sum(
        isinstance(dugum, KARMASIKLIK_DUGUMLERI)
        for dugum in ast.walk(tree)
    )
    return {
        "path": dosya.path,
        "error": None,
        "bulgular": bulgular,
        "karmasiklik": karmasiklik,
    }
`,
  "kod_platformu/parallel.py": `from concurrent.futures import ThreadPoolExecutor

from .analyzer import dosya_analizi


def paralel_analiz(dosyalar):
    if not dosyalar:
        return []
    with ThreadPoolExecutor(max_workers=min(4, len(dosyalar))) as executor:
        return list(executor.map(dosya_analizi, dosyalar))
`,
  "kod_platformu/resilience.py": `class CircuitBreaker:
    def __init__(self, esik=2):
        if esik < 1:
            raise ValueError("esik en az 1 olmalı")
        self.esik = esik
        self.basarisizlik = 0
        self.durum = "kapali"

    def izin_ver(self):
        return self.durum == "kapali"

    def basari(self):
        self.basarisizlik = 0
        self.durum = "kapali"

    def hata(self):
        self.basarisizlik += 1
        if self.basarisizlik >= self.esik:
            self.durum = "acik"
`,
  "kod_platformu/observability.py": `import hashlib
import json


def metrik_ozeti(toplam, benzersiz, analiz, hata, atlanmis, hedef):
    basari_orani = 100.0 if benzersiz == 0 else round(analiz / benzersiz * 100, 2)
    return {
        "toplam": toplam,
        "benzersiz": benzersiz,
        "analiz": analiz,
        "hata": hata,
        "atlanmis": atlanmis,
        "basari_orani": basari_orani,
        "slo": "healthy" if basari_orani >= hedef else "breach",
    }


def audit_koku(payload):
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
`,
  "kod_platformu/report.py": `from .models import KaynakDosya
from .observability import audit_koku, metrik_ozeti
from .parallel import paralel_analiz
from .resilience import CircuitBreaker


def analiz_raporu(dosyalar, hedef=99.0, esik=2):
    gorulen = set()
    benzersiz = []
    tekrarlar = []
    for ham_dosya in dosyalar:
        path = ham_dosya["path"]
        if path in gorulen:
            tekrarlar.append(path)
            continue
        gorulen.add(path)
        benzersiz.append(KaynakDosya(**ham_dosya))

    sonuclar = paralel_analiz(benzersiz)
    devre = CircuitBreaker(esik)
    analiz_edilen = []
    hatalar = []
    atlanmis = []
    bulgular = []
    karmasiklik = {}

    for sonuc in sonuclar:
        if not devre.izin_ver():
            atlanmis.append(sonuc["path"])
            continue
        if sonuc["error"]:
            hatalar.append(sonuc["path"])
            devre.hata()
            continue
        analiz_edilen.append(sonuc["path"])
        bulgular.extend(sonuc["bulgular"])
        karmasiklik[sonuc["path"]] = sonuc["karmasiklik"]
        devre.basari()

    bulgular.sort(key=lambda bulgu: (
        bulgu["path"],
        bulgu["line"],
        bulgu["kind"],
        bulgu["name"],
    ))
    karmasiklik = {path: karmasiklik[path] for path in sorted(karmasiklik)}
    metrikler = metrik_ozeti(
        len(dosyalar),
        len(benzersiz),
        len(analiz_edilen),
        len(hatalar),
        len(atlanmis),
        hedef,
    )
    payload = {
        "analiz_edilen": analiz_edilen,
        "tekrarlar": tekrarlar,
        "hatalar": hatalar,
        "atlanmis": atlanmis,
        "bulgular": bulgular,
        "karmasiklik": karmasiklik,
        "metrikler": metrikler,
        "devre": devre.durum,
    }
    return {**payload, "audit_root": audit_koku(payload)}
`,
};

describe("expert capstone project integration", () => {
  it("passes the complete reliable code analysis platform", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) throw new Error(JSON.stringify(result, null, 2));
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded visible report", () => {
    const weakFiles = {
      ...referenceFiles,
      "kod_platformu/report.py": `def analiz_raporu(dosyalar, hedef=99.0, esik=2):
    return {
        "analiz_edilen": ["a.py", "b.py"],
        "tekrarlar": ["a.py"],
        "hatalar": [],
        "atlanmis": [],
        "bulgular": [],
        "karmasiklik": {},
        "metrikler": {},
        "devre": "kapali",
        "audit_root": "0" * 64,
    }
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects a security rule that leaks the assigned secret value", () => {
    const weakFiles = {
      ...referenceFiles,
      "kod_platformu/security.py": `import ast

from .registry import kontrol_kaydi

HASSAS_PARÇALAR = ("password", "token", "secret", "api_key", "authorization")
GUVENSIZ_CAGRILAR = {"eval", "exec", "system", "popen"}


@kontrol_kaydi("secret_assignment")
def gizli_atamalar(tree, path):
    bulgular = []
    for dugum in ast.walk(tree):
        if isinstance(dugum, ast.Assign) and isinstance(dugum.targets[0], ast.Name):
            ad = dugum.targets[0].id
            if "token" in ad.lower():
                bulgular.append({
                    "path": path,
                    "kind": "secret_assignment",
                    "name": ast.literal_eval(dugum.value),
                    "line": dugum.lineno,
                })
    return bulgular


@kontrol_kaydi("unsafe_call")
def guvensiz_cagrilar(tree, path):
    return []
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects an implementation that does not create a thread pool", () => {
    const weakFiles = {
      ...referenceFiles,
      "kod_platformu/parallel.py": `from concurrent.futures import ThreadPoolExecutor

from .analyzer import dosya_analizi


def paralel_analiz(dosyalar):
    return [dosya_analizi(dosya) for dosya in dosyalar]
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects a circuit breaker that never opens", () => {
    const weakFiles = {
      ...referenceFiles,
      "kod_platformu/resilience.py": `class CircuitBreaker:
    def __init__(self, esik=2):
        self.esik = esik
        self.basarisizlik = 0
        self.durum = "kapali"

    def izin_ver(self):
        return True

    def basari(self):
        self.basarisizlik = 0

    def hata(self):
        self.basarisizlik += 1
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });
});
