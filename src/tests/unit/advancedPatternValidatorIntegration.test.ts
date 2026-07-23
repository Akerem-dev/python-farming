import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  TaskValidationResult,
  TaskValidationSpec,
} from "../../features/learning/taskValidationTypes";

const workspaces: string[] = [];
const validatorFilename = "__python_farming_advanced_patterns_validator__.py";

function readValidatorSource() {
  const servicePath = resolve(
    process.cwd(),
    "src/features/learning/services/advancedPatternTaskValidationService.ts",
  );
  const serviceSource = readFileSync(servicePath, "utf-8");
  const match = serviceSource.match(
    /const VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) {
    throw new Error("Advanced pattern validator Python source could not be extracted.");
  }
  return match[1].replace(
    "${JSON.stringify(VALIDATOR_PATH)}",
    JSON.stringify(validatorFilename),
  );
}

function runValidator(
  files: Record<string, string>,
  entrypoint: string,
  spec: TaskValidationSpec,
) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-advanced-pattern-test-"));
  workspaces.push(workspace);
  writeFileSync(join(workspace, validatorFilename), readValidatorSource(), "utf-8");

  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(workspace, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }

  const execution = spawnSync("python3", [validatorFilename], {
    cwd: workspace,
    input: JSON.stringify({
      files: [validatorFilename, ...Object.keys(files)],
      entrypoint,
      stdin: [],
      spec,
    }),
    encoding: "utf-8",
  });

  if (execution.status !== 0) {
    throw new Error(execution.stderr || "Advanced pattern validator process failed.");
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
});

describe("advanced pattern validator integration", () => {
  it("validates parameterized decorators, wraps and generator context managers", () => {
    const files = {
      "main.py": `from contextlib import contextmanager
from functools import wraps


def tekrar(adet):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            return [func(*args, **kwargs) for _ in range(adet)]
        return wrapper
    return decorator


@tekrar(2)
def iki_kati(sayi):
    return sayi * 2


@contextmanager
def gecici_ayar(ayarlar, anahtar, yeni_deger):
    eski_deger = ayarlar[anahtar]
    ayarlar[anahtar] = yeni_deger
    try:
        yield yeni_deger
    finally:
        ayarlar[anahtar] = eski_deger


def ayar_akisi():
    ayarlar = {"mod": "production"}
    with gecici_ayar(ayarlar, "mod", "test"):
        blok_ici = ayarlar["mod"]
    return [blok_ici, ayarlar["mod"]]


print(iki_kati(4))
print(ayar_akisi())
`,
    };
    const spec: TaskValidationSpec = {
      id: "integration.advanced-patterns",
      title: "Advanced patterns integration",
      xpReward: 1,
      timeoutMs: 7000,
      checks: [
        {
          id: "decorator",
          kind: "decorator_contract",
          name: "tekrar",
          file: "main.py",
          parameterized: true,
          requireWraps: true,
          targets: [
            {
              name: "iki_kati",
              expectedName: "iki_kati",
              cases: [
                { args: [4], expected: [8, 8] },
                { args: [-2], expected: [-4, -4] },
              ],
            },
          ],
          label: "Decorator contract",
          visibility: "visible",
        },
        {
          id: "context",
          kind: "context_manager_contract",
          name: "gecici_ayar",
          file: "main.py",
          implementation: "generator",
          requireTryFinally: true,
          probe: {
            name: "ayar_akisi",
            cases: [{ args: [], expected: ["test", "production"] }],
          },
          label: "Context manager contract",
          visibility: "visible",
        },
      ],
    };

    const result = runValidator(files, "main.py", spec);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("validates the complete audit and JSON resource project", () => {
    const files = {
      "main.py": `from service import rapor_uret

rapor = rapor_uret("data/islemler.json", "output/rapor.json")
print(f"İşlem sayısı: {rapor['islem_sayisi']}")
print(f"Toplam: {rapor['toplam']}")
print(f"Kategoriler: {', '.join(rapor['kategoriler'])}")
`,
      "decorators.py": `from functools import wraps

AUDIT_LOG = []


def audit(olay):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            AUDIT_LOG.append({"olay": olay, "asama": "basladi"})
            try:
                return func(*args, **kwargs)
            finally:
                AUDIT_LOG.append({"olay": olay, "asama": "bitti"})
        return wrapper
    return decorator
`,
      "resources.py": `class JsonKaynak:
    def __init__(self, yol):
        self.yol = yol
        self.dosya = None

    def __enter__(self):
        self.dosya = open(self.yol, "r", encoding="utf-8")
        return self.dosya

    def __exit__(self, exc_type, exc, tb):
        if self.dosya is not None:
            self.dosya.close()
        return False
`,
      "service.py": `import json
from decimal import Decimal
from pathlib import Path
from decorators import audit
from resources import JsonKaynak


@audit("rapor")
def rapor_uret(kaynak: str, hedef: str) -> dict[str, object]:
    with JsonKaynak(kaynak) as dosya:
        islemler = json.load(dosya)

    toplam = sum((Decimal(str(islem["tutar"])) for islem in islemler), Decimal("0.00"))
    rapor = {
        "islem_sayisi": len(islemler),
        "toplam": f"{toplam:.2f}",
        "kategoriler": sorted({str(islem["kategori"]) for islem in islemler}),
    }
    hedef_yolu = Path(hedef)
    hedef_yolu.parent.mkdir(parents=True, exist_ok=True)
    with hedef_yolu.open("w", encoding="utf-8") as dosya:
        json.dump(rapor, dosya, ensure_ascii=False, indent=2)
    return rapor
`,
      "data/islemler.json": `[
  {"kategori": "Kırtasiye", "tutar": "45.50"},
  {"kategori": "Aksesuar", "tutar": "120.00"},
  {"kategori": "Kırtasiye", "tutar": "15.25"}
]
`,
    };
    const spec: TaskValidationSpec = {
      id: "integration.resource-project",
      title: "Resource project integration",
      xpReward: 1,
      timeoutMs: 9000,
      checks: [
        {
          id: "project",
          kind: "resource_management_project",
          requiredFiles: Object.keys(files),
          decoratorName: "audit",
          contextManagerName: "JsonKaynak",
          functionName: "rapor_uret",
          functionModule: "service",
          label: "Resource project",
          visibility: "visible",
        },
        {
          id: "output-file",
          kind: "file_exists",
          path: "output/rapor.json",
          label: "Output file",
          visibility: "visible",
        },
        {
          id: "output-json",
          kind: "json_file_equals",
          path: "output/rapor.json",
          expected: {
            islem_sayisi: 3,
            toplam: "180.75",
            kategoriler: ["Aksesuar", "Kırtasiye"],
          },
          label: "Output JSON",
          visibility: "hidden",
        },
        {
          id: "source-safe",
          kind: "file_unchanged",
          path: "data/islemler.json",
          label: "Source safe",
          visibility: "hidden",
        },
      ],
    };

    const result = runValidator(files, "main.py", spec);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });
});
