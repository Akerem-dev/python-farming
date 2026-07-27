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
      resolve(process.cwd(), "public/content/modules/security-observability.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find((candidate) => candidate.id === "expert.security.final");
  if (!lesson) throw new Error("Expert security and observability final lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-expert-security-"));
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
      execution.stderr || execution.error?.message || "Expert security validator failed.",
    );
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length) rmSync(workspaces.pop()!, { recursive: true, force: true });
});

const referenceFiles = {
  "main.py": `from gozlem_merkezi import gozlem_raporu


if __name__ == "__main__":
    print(gozlem_raporu([
        {
            "id": "e1",
            "correlation_id": "c1",
            "status": "ok",
            "duration_ms": 100,
            "context": {"user": "ali", "token": "abc"},
        }
    ]))
`,
  "gozlem_merkezi/__init__.py": `from .report import gozlem_raporu

__all__ = ["gozlem_raporu"]
`,
  "gozlem_merkezi/models.py": `from dataclasses import dataclass


@dataclass(frozen=True)
class Olay:
    id: str
    correlation_id: str
    status: str
    duration_ms: int
    context: dict
`,
  "gozlem_merkezi/redaction.py": `HASSAS_ALANLAR = {"password", "token", "secret", "api_key", "authorization"}


def guvenli_baglam(baglam):
    return {
        anahtar: "[REDACTED]" if str(anahtar).lower() in HASSAS_ALANLAR else deger
        for anahtar, deger in baglam.items()
    }
`,
  "gozlem_merkezi/logs.py": `from .redaction import guvenli_baglam


def yapilandirilmis_kayit(olay):
    return {
        "id": olay.id,
        "correlation_id": olay.correlation_id or "unknown",
        "level": "info" if olay.status == "ok" else "error",
        "duration_ms": olay.duration_ms,
        "context": guvenli_baglam(olay.context),
    }
`,
  "gozlem_merkezi/metrics.py": `def metrik_ozeti(olaylar, hedef=99.0):
    toplam = len(olaylar)
    basarili = sum(1 for olay in olaylar if olay.status == "ok")
    basari_orani = 100.0 if toplam == 0 else round(basarili / toplam * 100, 2)
    ortalama_ms = 0.0 if toplam == 0 else round(
        sum(olay.duration_ms for olay in olaylar) / toplam,
        2,
    )
    return {
        "toplam": toplam,
        "basarili": basarili,
        "hata": toplam - basarili,
        "basari_orani": basari_orani,
        "ortalama_ms": ortalama_ms,
        "slo": "healthy" if basari_orani >= hedef else "breach",
    }
`,
  "gozlem_merkezi/audit.py": `import hashlib
import json


def audit_koku(kayitlar):
    onceki = "0" * 64
    for kayit in kayitlar:
        canonical = json.dumps(
            kayit,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        onceki = hashlib.sha256(f"{onceki}|{canonical}".encode("utf-8")).hexdigest()
    return onceki
`,
  "gozlem_merkezi/report.py": `from .audit import audit_koku
from .logs import yapilandirilmis_kayit
from .metrics import metrik_ozeti
from .models import Olay


def gozlem_raporu(olaylar, hedef=99.0):
    modeller = [Olay(**olay) for olay in olaylar]
    kayitlar = [yapilandirilmis_kayit(olay) for olay in modeller]
    iz_sayilari = {}
    for kayit in kayitlar:
        kimlik = kayit["correlation_id"]
        iz_sayilari[kimlik] = iz_sayilari.get(kimlik, 0) + 1
    izler = {kimlik: iz_sayilari[kimlik] for kimlik in sorted(iz_sayilari)}
    return {
        "kayitlar": kayitlar,
        "metrikler": metrik_ozeti(modeller, hedef),
        "izler": izler,
        "audit_root": audit_koku(kayitlar),
    }
`,
};

describe("expert security and observability project integration", () => {
  it("passes the secure multi-file observability reference implementation", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) throw new Error(JSON.stringify(result, null, 2));
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded visible report", () => {
    const weakFiles = {
      ...referenceFiles,
      "gozlem_merkezi/report.py": `def gozlem_raporu(olaylar, hedef=99.0):
    return {
        "kayitlar": [],
        "metrikler": {"toplam": 0, "basarili": 0, "hata": 0, "basari_orani": 100.0, "ortalama_ms": 0.0, "slo": "healthy"},
        "izler": {},
        "audit_root": "0" * 64,
    }
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects a redaction layer that leaks raw secrets", () => {
    const weakFiles = {
      ...referenceFiles,
      "gozlem_merkezi/redaction.py": `HASSAS_ALANLAR = {"password", "token", "secret", "api_key", "authorization"}


def guvenli_baglam(baglam):
    return dict(baglam)
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });

  it("rejects a constant audit root", () => {
    const weakFiles = {
      ...referenceFiles,
      "gozlem_merkezi/audit.py": `import hashlib
import json


def audit_koku(kayitlar):
    return "0" * 64
`,
    };
    expect(runValidator(weakFiles, finalSpec()).passed).toBe(false);
  });
});
