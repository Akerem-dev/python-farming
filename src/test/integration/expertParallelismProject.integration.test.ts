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
      resolve(process.cwd(), "public/content/modules/parallelism-systems.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find(
    (candidate) => candidate.id === "expert.parallelism.final",
  );
  if (!lesson) throw new Error("Expert parallelism final lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-expert-parallelism-"));
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
    throw new Error(execution.stderr || execution.error?.message || "Expert parallelism validator failed.");
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

const referenceFiles = {
  "main.py": `from paralel_lab import istasyon_raporu

if __name__ == "__main__":
    gorevler = [
        {"id": "a", "deger": 2},
        {"id": "b", "deger": -1},
        {"id": "c", "deger": 4},
    ]
    print(istasyon_raporu(gorevler, 3))
`,
  "paralel_lab/__init__.py": `from .pipeline import istasyon_raporu

__all__ = ["istasyon_raporu"]
`,
  "paralel_lab/policy.py": `def normalize_workers(worker_sayisi):
    return max(1, min(8, int(worker_sayisi)))
`,
  "paralel_lab/worker.py": `def gorevi_isle(gorev):
    if not isinstance(gorev, dict):
        raise ValueError("gecersiz_gorev")

    gorev_id = gorev.get("id")
    deger = gorev.get("deger")
    if not isinstance(gorev_id, str) or not gorev_id:
        raise ValueError("gecersiz_gorev")
    if isinstance(deger, bool) or not isinstance(deger, (int, float)):
        raise ValueError("gecersiz_deger")
    if deger < 0:
        raise ValueError("negatif_deger")

    return {"id": gorev_id, "sonuc": deger * deger}
`,
  "paralel_lab/reporting.py": `def raporla(basarili, hatalar, worker_sayisi):
    basarili_sirali = sorted(basarili, key=lambda kayit: kayit["id"])
    hatalar_sirali = sorted(hatalar, key=lambda kayit: kayit["id"])
    return {
        "basarili": basarili_sirali,
        "hatalar": hatalar_sirali,
        "toplam": len(basarili_sirali) + len(hatalar_sirali),
        "worker_sayisi": worker_sayisi,
    }
`,
  "paralel_lab/pipeline.py": `from concurrent.futures import ThreadPoolExecutor, as_completed

from .policy import normalize_workers
from .reporting import raporla
from .worker import gorevi_isle


def istasyon_raporu(gorevler, worker_sayisi=4):
    limit = normalize_workers(worker_sayisi)
    if not gorevler:
        return raporla([], [], limit)

    basarili = []
    hatalar = []
    with ThreadPoolExecutor(max_workers=limit, thread_name_prefix="python-farming") as executor:
        future_to_id = {
            executor.submit(gorevi_isle, gorev): gorev.get("id", "?")
            for gorev in gorevler
        }
        for future in as_completed(future_to_id):
            gorev_id = future_to_id[future]
            try:
                basarili.append(future.result())
            except ValueError as error:
                hatalar.append({"id": gorev_id, "hata": str(error)})

    return raporla(basarili, hatalar, limit)
`,
};

describe("expert parallelism project integration", () => {
  it("passes the concurrent multi-file reference implementation", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) throw new Error(JSON.stringify(result, null, 2));
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded visible station report", () => {
    const weakFiles = {
      ...referenceFiles,
      "paralel_lab/pipeline.py": `def istasyon_raporu(gorevler, worker_sayisi=4):
    return {
        "basarili": [{"id": "a", "sonuc": 4}, {"id": "c", "sonuc": 16}],
        "hatalar": [{"id": "b", "hata": "negatif_deger"}],
        "toplam": 3,
        "worker_sayisi": 3,
    }
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects a sequential implementation without future lifecycle calls", () => {
    const weakFiles = {
      ...referenceFiles,
      "paralel_lab/pipeline.py": `from .policy import normalize_workers
from .reporting import raporla
from .worker import gorevi_isle


def istasyon_raporu(gorevler, worker_sayisi=4):
    limit = normalize_workers(worker_sayisi)
    basarili = []
    hatalar = []
    for gorev in gorevler:
        try:
            basarili.append(gorevi_isle(gorev))
        except ValueError as error:
            hatalar.append({"id": gorev.get("id", "?"), "hata": str(error)})
    return raporla(basarili, hatalar, limit)
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });
});
