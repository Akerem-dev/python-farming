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
  const match = source.match(/const PROJECT_VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/);
  if (!match?.[1]) throw new Error("Project validator source could not be extracted.");
  return match[1].replace(
    "${JSON.stringify(PROJECT_VALIDATOR_PATH)}",
    JSON.stringify(validatorFilename),
  );
}

function finalSpec() {
  const modulePackage = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/architecture-patterns.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find((candidate) => candidate.id === "advanced.arch.final");
  if (!lesson) throw new Error("Architecture final lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-architecture-"));
  workspaces.push(workspace);
  writeFileSync(join(workspace, validatorFilename), validatorSource(), "utf-8");
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(workspace, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }
  const execution = spawnSync("python3", [validatorFilename], {
    cwd: workspace,
    input: JSON.stringify({ files: [validatorFilename, ...Object.keys(files)], entrypoint: "main.py", stdin: [], spec }),
    encoding: "utf-8",
  });
  if (execution.status !== 0) throw new Error(execution.stderr || "Architecture validator failed.");
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

const referenceFiles = {
  "main.py": "from app import senaryo_calistir\n",
  "domain.py": `from dataclasses import dataclass
@dataclass(frozen=True)
class Urun:
    id: int
    ad: str
    fiyat: int
`,
  "ports.py": `from typing import Protocol
class UrunRepository(Protocol):
    def kaydet(self, urun): ...
    def listele(self): ...
`,
  "adapters.py": `class BellekRepository:
    def __init__(self): self._urunler = []
    def kaydet(self, urun): self._urunler.append(urun)
    def listele(self): return list(self._urunler)
`,
  "strategies.py": `class StandartFiyat:
    def uygula(self, fiyat): return fiyat
class IndirimliFiyat:
    def uygula(self, fiyat): return int(fiyat * 0.8)
`,
  "service.py": `class KatalogServisi:
    def __init__(self, repository, fiyat_stratejisi):
        self.repository = repository
        self.fiyat_stratejisi = fiyat_stratejisi
    def urun_ekle(self, urun): self.repository.kaydet(urun)
    def rapor(self):
        urunler = self.repository.listele()
        return {
            "urun_sayisi": len(urunler),
            "toplam_fiyat": sum(self.fiyat_stratejisi.uygula(u.fiyat) for u in urunler),
            "urunler": sorted(u.ad for u in urunler),
        }
`,
  "factory.py": `from adapters import BellekRepository
from service import KatalogServisi
from strategies import IndirimliFiyat, StandartFiyat

def servis_olustur(indirimli=False):
    return KatalogServisi(BellekRepository(), IndirimliFiyat() if indirimli else StandartFiyat())
`,
  "app.py": `from domain import Urun
from factory import servis_olustur

def senaryo_calistir(urunler, indirimli=False):
    servis = servis_olustur(indirimli)
    for veri in urunler:
        servis.urun_ekle(Urun(**veri))
    return servis.rapor()
`,
};

describe("architecture patterns project integration", () => {
  it("passes the layered reference solution", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) throw new Error(JSON.stringify(result, null, 2));
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded visible report", () => {
    const weakFiles = {
      ...referenceFiles,
      "app.py": `def senaryo_calistir(urunler, indirimli=False):
    return {"urun_sayisi": 1, "toplam_fiyat": 1000, "urunler": ["Defter"]}
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });
});
