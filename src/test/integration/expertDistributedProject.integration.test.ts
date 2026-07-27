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
      resolve(process.cwd(), "public/content/modules/distributed-resilience.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find(
    (candidate) => candidate.id === "expert.distributed.final",
  );
  if (!lesson) throw new Error("Expert distributed systems final lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-expert-distributed-"));
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
      execution.stderr || execution.error?.message || "Expert distributed validator failed.",
    );
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

const referenceFiles = {
  "main.py": `from dayanikli_sistem import dayaniklilik_raporu

if __name__ == "__main__":
    print(dayaniklilik_raporu(
        [{"id": "a", "deger": 10}],
        {"a": [False, True]},
    ))
`,
  "dayanikli_sistem/__init__.py": `from .orchestrator import dayaniklilik_raporu

__all__ = ["dayaniklilik_raporu"]
`,
  "dayanikli_sistem/models.py": `from dataclasses import dataclass


@dataclass(frozen=True)
class Olay:
    id: str
    deger: int
`,
  "dayanikli_sistem/retry.py": `class RetryPolicy:
    def __init__(self, max_deneme=3):
        if max_deneme < 1:
            raise ValueError("max_deneme en az 1 olmalı")
        self.max_deneme = max_deneme

    def calistir(self, sonuclar):
        deneme = 0
        for basarili in list(sonuclar)[: self.max_deneme]:
            deneme += 1
            if basarili:
                return True, deneme
        return False, deneme
`,
  "dayanikli_sistem/idempotency.py": `class IdempotencyRegistry:
    def __init__(self):
        self._kimlikler = set()

    def icerir(self, olay_id):
        return olay_id in self._kimlikler

    def ekle(self, olay_id):
        self._kimlikler.add(olay_id)
`,
  "dayanikli_sistem/breaker.py": `class CircuitBreaker:
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
  "dayanikli_sistem/orchestrator.py": `from .breaker import CircuitBreaker
from .idempotency import IdempotencyRegistry
from .models import Olay
from .retry import RetryPolicy


def dayaniklilik_raporu(olaylar, servis_sonuclari, esik=2):
    retry = RetryPolicy(3)
    kayit = IdempotencyRegistry()
    devre = CircuitBreaker(esik)
    islenen = []
    tekrarlar = []
    basarisiz = []
    atlanmis = []
    toplam = 0
    deneme = 0

    for ham_olay in olaylar:
        olay = Olay(**ham_olay)
        if kayit.icerir(olay.id):
            tekrarlar.append(olay.id)
            continue
        if not devre.izin_ver():
            atlanmis.append(olay.id)
            continue

        kayit.ekle(olay.id)
        basarili, kullanilan = retry.calistir(servis_sonuclari.get(olay.id, [False]))
        deneme += kullanilan
        if basarili:
            islenen.append(olay.id)
            toplam += olay.deger
            devre.basari()
        else:
            basarisiz.append(olay.id)
            devre.hata()

    return {
        "islenen": islenen,
        "tekrarlar": tekrarlar,
        "basarisiz": basarisiz,
        "atlanmis": atlanmis,
        "toplam": toplam,
        "devre": devre.durum,
        "deneme": deneme,
    }
`,
};

describe("expert distributed systems project integration", () => {
  it("passes the multi-file resilience reference implementation", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) throw new Error(JSON.stringify(result, null, 2));
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded visible report", () => {
    const weakFiles = {
      ...referenceFiles,
      "dayanikli_sistem/orchestrator.py": `def dayaniklilik_raporu(olaylar, servis_sonuclari, esik=2):
    return {
        "islenen": ["a", "b"],
        "tekrarlar": ["a"],
        "basarisiz": [],
        "atlanmis": [],
        "toplam": 30,
        "devre": "kapali",
        "deneme": 3,
    }
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects an implementation that ignores the circuit breaker", () => {
    const weakFiles = {
      ...referenceFiles,
      "dayanikli_sistem/breaker.py": `class CircuitBreaker:
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
