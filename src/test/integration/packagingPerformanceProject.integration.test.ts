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
      resolve(process.cwd(), "public/content/modules/packaging-performance.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find(
    (candidate) => candidate.id === "advanced.performance.final",
  );
  if (!lesson) throw new Error("Performance final lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-performance-"));
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
    throw new Error(execution.stderr || execution.error?.message || "Performance validator failed.");
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

const referenceFiles = {
  "main.py": `from performans_lab.app import performans_raporu

if __name__ == "__main__":
    print(performans_raporu(["A", "B", "A"], ["B", "C", "A"]))
`,
  "performans_lab/__init__.py": `from .app import performans_raporu

__version__ = "1.0.0"
__all__ = ["performans_raporu", "__version__"]
`,
  "performans_lab/baseline.py": `def ortak_yavas(sol, sag):
    sonuc = []
    karsilastirma = 0
    for kod in sol:
        sol_kod = str(kod).strip().upper()
        for diger in sag:
            karsilastirma += 1
            sag_kod = str(diger).strip().upper()
            if sol_kod == sag_kod and sol_kod not in sonuc:
                sonuc.append(sol_kod)
    return sorted(sonuc), karsilastirma
`,
  "performans_lab/optimized.py": `from functools import lru_cache

@lru_cache(maxsize=128)
def normalize(kod):
    return str(kod).strip().upper()


def ortak_hizli(sol, sag):
    sag_indeksi = set(normalize(kod) for kod in sag)
    sonuc = []
    islem = 0
    for kod in sol:
        islem += 1
        temiz = normalize(kod)
        if temiz in sag_indeksi and temiz not in sonuc:
            sonuc.append(temiz)
    return sorted(sonuc), islem
`,
  "performans_lab/profiling.py": `import cProfile
import io
import pstats
import tracemalloc
from timeit import repeat


def profil_kontrolu(fonksiyon, *args):
    profiler = cProfile.Profile()
    tracemalloc.start()
    once = tracemalloc.take_snapshot()
    profiler.enable()
    sonuc = fonksiyon(*args)
    profiler.disable()
    sonra = tracemalloc.take_snapshot()
    bellek = sum(stat.size_diff for stat in sonra.compare_to(once, "lineno"))
    tracemalloc.stop()

    akis = io.StringIO()
    pstats.Stats(profiler, stream=akis).sort_stats("cumulative").print_stats()
    sureler = repeat(lambda: fonksiyon(*args), number=1, repeat=2)
    return {
        "sonuc": sonuc,
        "profil_var": fonksiyon.__name__ in akis.getvalue(),
        "bellek_olculdu": isinstance(bellek, int),
        "tekrar": len(sureler),
    }
`,
  "performans_lab/app.py": `from .baseline import ortak_yavas
from .optimized import ortak_hizli
from .profiling import profil_kontrolu


def performans_raporu(sol, sag):
    yavas_sonuc, yavas_islem = ortak_yavas(sol, sag)
    hizli_sonuc, hizli_islem = ortak_hizli(sol, sag)
    profil = profil_kontrolu(ortak_hizli, sol, sag)
    return {
        "sonuc": hizli_sonuc,
        "esit": hizli_sonuc == yavas_sonuc,
        "yavas_islem": yavas_islem,
        "hizli_islem": hizli_islem,
        "iyilesti": hizli_islem < yavas_islem,
        "profil_var": bool(profil["profil_var"]),
    }
`,
};

describe("packaging and performance project integration", () => {
  it("passes the packaged reference implementation", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) throw new Error(JSON.stringify(result, null, 2));
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded visible report", () => {
    const weakFiles = {
      ...referenceFiles,
      "performans_lab/app.py": `def performans_raporu(sol, sag):
    return {"sonuc": ["A", "B"], "esit": True, "yavas_islem": 9, "hizli_islem": 3, "iyilesti": True, "profil_var": True}
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects an optimized implementation with nested loops", () => {
    const weakFiles = {
      ...referenceFiles,
      "performans_lab/optimized.py": `from functools import lru_cache

@lru_cache(maxsize=128)
def normalize(kod):
    return str(kod).strip().upper()


def ortak_hizli(sol, sag):
    sag_indeksi = set(normalize(kod) for kod in sag)
    sonuc = []
    islem = 0
    for kod in sol:
        for diger in sag:
            islem += 1
            if normalize(kod) == normalize(diger):
                sonuc.append(normalize(kod))
    return sorted(set(sonuc)), islem
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });
});
