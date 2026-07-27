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
  "main.py": `from statik_analiz import denetim_raporu

if __name__ == "__main__":
    print(denetim_raporu("import os\\nos.system('x')"))
`,
  "statik_analiz/__init__.py": `from .report import denetim_raporu

__all__ = ["denetim_raporu"]
`,
  "statik_analiz/models.py": `from dataclasses import dataclass


@dataclass(frozen=True, order=True)
class Bulgu:
    satir: int
    tur: str
    ad: str

    def sozluk(self):
        return {"tur": self.tur, "ad": self.ad, "satir": self.satir}
`,
  "statik_analiz/rules.py": `YASAK_MODULLER = {"os", "subprocess"}
RISKLI_CAGRILAR = {"eval", "exec", "os.system", "subprocess.run"}


def temel_modul(ad):
    return ad.split(".", 1)[0]
`,
  "statik_analiz/visitor.py": `import ast

from .models import Bulgu
from .rules import RISKLI_CAGRILAR, YASAK_MODULLER, temel_modul


class DenetimZiyaretcisi(ast.NodeVisitor):
    def __init__(self):
        self.fonksiyonlar = set()
        self.siniflar = set()
        self.karar_noktalari = 0
        self.bulgular = set()
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

    def visit_If(self, node):
        self.karar_noktalari += 1
        self.generic_visit(node)

    def visit_For(self, node):
        self.karar_noktalari += 1
        self.generic_visit(node)

    def visit_While(self, node):
        self.karar_noktalari += 1
        self.generic_visit(node)

    def visit_Import(self, node):
        for alias in node.names:
            root = temel_modul(alias.name)
            self.aliaslar[alias.asname or root] = root
            if root in YASAK_MODULLER:
                self.bulgular.add(Bulgu(node.lineno, "yasak_modul", root))
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        root = temel_modul(node.module or "")
        if root in YASAK_MODULLER:
            self.bulgular.add(Bulgu(node.lineno, "yasak_modul", root))
        for alias in node.names:
            tam_ad = f"{root}.{alias.name}" if root else alias.name
            self.aliaslar[alias.asname or alias.name] = tam_ad
        self.generic_visit(node)

    def visit_Call(self, node):
        ad = self.noktali_ad(node.func)
        if ad:
            parcalar = ad.split(".")
            if parcalar[0] in self.aliaslar:
                parcalar[0] = self.aliaslar[parcalar[0]]
                ad = ".".join(parcalar)
            if ad in RISKLI_CAGRILAR:
                self.bulgular.add(Bulgu(node.lineno, "riskli_cagri", ad))
        self.generic_visit(node)

    def noktali_ad(self, node):
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            sol = self.noktali_ad(node.value)
            return f"{sol}.{node.attr}" if sol else node.attr
        return ""
`,
  "statik_analiz/report.py": `import ast

from .visitor import DenetimZiyaretcisi


def denetim_raporu(kaynak):
    agac = ast.parse(kaynak)
    ziyaretci = DenetimZiyaretcisi()
    ziyaretci.visit(agac)
    return {
        "fonksiyonlar": [ad for ad in sorted(ziyaretci.fonksiyonlar)],
        "siniflar": [ad for ad in sorted(ziyaretci.siniflar)],
        "karar_noktalari": ziyaretci.karar_noktalari,
        "bulgular": [bulgu.sozluk() for bulgu in sorted(ziyaretci.bulgular)],
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
      "statik_analiz/report.py": `def denetim_raporu(kaynak):
    return {
        "fonksiyonlar": ["hesapla"],
        "siniflar": [],
        "karar_noktalari": 1,
        "bulgular": [{"tur": "yasak_modul", "ad": "os", "satir": 1}],
    }
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects text searching without an AST visitor", () => {
    const weakFiles = {
      ...referenceFiles,
      "statik_analiz/visitor.py": `class DenetimZiyaretcisi:
    pass
`,
      "statik_analiz/report.py": `def denetim_raporu(kaynak):
    return {
        "fonksiyonlar": [],
        "siniflar": [],
        "karar_noktalari": 0,
        "bulgular": [],
    }
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });
});
