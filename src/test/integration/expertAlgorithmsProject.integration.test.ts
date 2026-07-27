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
      resolve(process.cwd(), "public/content/modules/algorithms-complexity.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find(
    (candidate) => candidate.id === "expert.algorithms.final",
  );
  if (!lesson) throw new Error("Expert algorithms final lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-expert-algorithms-"));
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
    throw new Error(execution.stderr || execution.error?.message || "Expert algorithms validator failed.");
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

const referenceFiles = {
  "main.py": `from karar_motoru import karar_raporu

if __name__ == "__main__":
    graf = {"A": ["B", "C"], "B": ["D"], "C": ["D"], "D": []}
    print(karar_raporu([1, 3, 3, 7, 9], 3, graf, "A", "D", [1, 3, 4], 6))
`,
  "karar_motoru/__init__.py": `from .app import karar_raporu

__all__ = ["karar_raporu"]
`,
  "karar_motoru/search.py": `def binary_search(veriler, hedef):
    sol = 0
    sag = len(veriler) - 1
    sonuc = -1
    while sol <= sag:
        orta = (sol + sag) // 2
        if veriler[orta] < hedef:
            sol = orta + 1
        elif veriler[orta] > hedef:
            sag = orta - 1
        else:
            sonuc = orta
            sag = orta - 1
    return sonuc
`,
  "karar_motoru/graph.py": `from collections import deque


def en_kisa_mesafe(graf, baslangic, hedef):
    if baslangic == hedef:
        return 0
    if baslangic not in graf:
        return -1
    kuyruk = deque([(baslangic, 0)])
    gorulen = {baslangic}
    while kuyruk:
        dugum, mesafe = kuyruk.popleft()
        for komsu in graf.get(dugum, []):
            if komsu == hedef:
                return mesafe + 1
            if komsu not in gorulen:
                gorulen.add(komsu)
                kuyruk.append((komsu, mesafe + 1))
    return -1
`,
  "karar_motoru/optimizer.py": `from functools import lru_cache


def minimum_para_sayisi(paralar, hedef):
    temiz = tuple(sorted({para for para in paralar if para > 0}))

    @lru_cache(maxsize=None)
    def coz(kalan):
        if kalan == 0:
            return 0
        if kalan < 0 or not temiz:
            return float("inf")
        return min((coz(kalan - para) + 1 for para in temiz), default=float("inf"))

    sonuc = coz(hedef)
    return -1 if sonuc == float("inf") else sonuc
`,
  "karar_motoru/app.py": `from .graph import en_kisa_mesafe
from .optimizer import minimum_para_sayisi
from .search import binary_search


def karar_raporu(veriler, hedef, graf, baslangic, bitis, paralar, tutar):
    return {
        "indeks": binary_search(veriler, hedef),
        "mesafe": en_kisa_mesafe(graf, baslangic, bitis),
        "minimum_para": minimum_para_sayisi(paralar, tutar),
    }
`,
};

describe("expert algorithms project integration", () => {
  it("passes the multi-file reference implementation", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) throw new Error(JSON.stringify(result, null, 2));
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded visible decision report", () => {
    const weakFiles = {
      ...referenceFiles,
      "karar_motoru/app.py": `def karar_raporu(veriler, hedef, graf, baslangic, bitis, paralar, tutar):
    return {"indeks": 1, "mesafe": 2, "minimum_para": 2}
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });
});
