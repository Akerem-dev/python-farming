import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";
import type { TaskValidationResult, TaskValidationSpec } from "../../features/learning/taskValidationTypes";

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
    readFileSync(
      resolve(process.cwd(), "public/content/modules/compilers-metaprogramming.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find(
    (candidate) => candidate.id === "expert.compilers.final",
  );
  if (!lesson) throw new Error("Expert compilers final lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-expert-compilers-"));
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
      execution.stderr || execution.error?.message || "Expert compilers validator failed.",
    );
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

const referenceFiles = {
  "main.py": `from statik_analiz import analiz_raporu

if __name__ == "__main__":
    print(analiz_raporu("import subprocess\\neval('1+1')"))
`,
  "statik_analiz/__init__.py": `from .report import analiz_raporu

__all__ = ["analiz_raporu"]
`,
  "statik_analiz/models.py": `from dataclasses import dataclass

@dataclass(frozen=True)
class Bulgu:
    tur: str
    ad: str
    satir: int

    def anahtar(self):
        return (self.satir, self.tur, self.ad)
`,
  "statik_analiz/rules.py": `YASAK_IMPORTLAR = {"subprocess", "socket", "ctypes"}
RISKLI_CAGRILAR = {"eval", "exec", "compile", "__import__"}

def kok_modul(ad):
    return ad.split(".")[0]
`,
  "statik_analiz/visitor.py": `import ast

from .models import Bulgu
from .rules import RISKLI_CAGRILAR, YASAK_IMPORTLAR, kok_modul


def cagri_adi(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        sol = cagri_adi(node.value)
        return f"{sol}.{node.attr}" if sol else node.attr
    return ""


class StatikAnalizZiyaretcisi(ast.NodeVisitor):
    def __init__(self):
        self.fonksiyonlar = set()
        self.siniflar = set()
        self.bulgular = []
        self.karmasiklik = 1
        self.aliaslar = {}

    def visit_FunctionDef(self, node):
        self.fonksiyonlar.add(node.name)
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node):
        self.fonksiyonlar.add(node.name)
        self.generic_visit(node)

    def visit_ClassDef(self, node):
        self.siniflar.add(node.name)
        self.generic_visit(node)

    def visit_Import(self, node):
        for alias in node.names:
            root = kok_modul(alias.name)
            self.aliaslar[alias.asname or root] = root
            if root in YASAK_IMPORTLAR:
                self.bulgular.append(Bulgu("import", root, node.lineno))
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        root = kok_modul(node.module or "")
        if root in YASAK_IMPORTLAR:
            self.bulgular.append(Bulgu("import", root, node.lineno))
        for alias in node.names:
            self.aliaslar[alias.asname or alias.name] = (
                f"{root}.{alias.name}" if root else alias.name
            )
        self.generic_visit(node)

    def visit_Call(self, node):
        ad = cagri_adi(node.func)
        parts = ad.split(".")
        if parts and parts[0] in self.aliaslar:
            parts[0] = self.aliaslar[parts[0]]
            ad = ".".join(parts)
        if ad in RISKLI_CAGRILAR:
            self.bulgular.append(Bulgu("cagri", ad, node.lineno))
        self.generic_visit(node)

    def visit_If(self, node):
        self.karmasiklik += 1
        self.generic_visit(node)

    def visit_For(self, node):
        self.karmasiklik += 1
        self.generic_visit(node)

    def visit_While(self, node):
        self.karmasiklik += 1
        self.generic_visit(node)
`,
  "statik_analiz/report.py": `import ast

from .visitor import StatikAnalizZiyaretcisi


def analiz_raporu(kaynak):
    agac = ast.parse(kaynak)
    ziyaretci = StatikAnalizZiyaretcisi()
    ziyaretci.visit(agac)
    benzersiz = {bulgu.anahtar(): bulgu for bulgu in ziyaretci.bulgular}
    bulgular = [
        {"tur": bulgu.tur, "ad": bulgu.ad, "satir": bulgu.satir}
        for bulgu in sorted(benzersiz.values(), key=lambda item: item.anahtar())
    ]
    return {
        "fonksiyonlar": sorted(ziyaretci.fonksiyonlar),
        "siniflar": sorted(ziyaretci.siniflar),
        "karmasiklik": ziyaretci.karmasiklik,
        "bulgular": bulgular,
    }
`,
};

describe("expert compilers project integration", () => {
  it("passes the multi-file AST reference implementation", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) throw new Error(JSON.stringify(result, null, 2));
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded visible report", () => {
    const weakFiles = {
      ...referenceFiles,
      "statik_analiz/report.py": `def analiz_raporu(kaynak):
    return {
        "fonksiyonlar": ["calistir"],
        "siniflar": ["Islem"],
        "karmasiklik": 2,
        "bulgular": [
            {"tur": "import", "ad": "subprocess", "satir": 1},
            {"tur": "cagri", "ad": "eval", "satir": 5},
        ],
    }
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects text searching without an AST visitor", () => {
    const weakFiles = {
      ...referenceFiles,
      "statik_analiz/visitor.py": `class StatikAnalizZiyaretcisi:
    pass
`,
      "statik_analiz/report.py": `def analiz_raporu(kaynak):
    return {
        "fonksiyonlar": [],
        "siniflar": [],
        "karmasiklik": 1,
        "bulgular": [],
    }
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });
});
