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
const validatorFilename = "__python_farming_capstone_validator__.py";

function readValidatorSource() {
  const servicePath = resolve(
    process.cwd(),
    "src/features/learning/services/capstoneTaskValidationService.ts",
  );
  const serviceSource = readFileSync(servicePath, "utf-8");
  const match = serviceSource.match(
    /const VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) {
    throw new Error("Capstone validator Python source could not be extracted.");
  }
  return match[1].replace(
    "${JSON.stringify(VALIDATOR_PATH)}",
    JSON.stringify(validatorFilename),
  );
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-capstone-test-"));
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
      entrypoint: "main.py",
      stdin: [],
      spec,
    }),
    encoding: "utf-8",
  });

  if (execution.status !== 0) {
    throw new Error(execution.stderr || "Capstone validator process failed.");
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

const files = {
  "main.py": `print("capstone ready")
`,
  "models.py": `from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import Enum

class SiparisDurumu(Enum):
    TASLAK = "taslak"
    TAMAMLANDI = "tamamlandi"

@dataclass(frozen=True)
class SiparisKalemi:
    ad: str
    birim_fiyat: Decimal
    adet: int

    def toplam(self) -> Decimal:
        return self.birim_fiyat * self.adet

@dataclass
class Siparis:
    siparis_id: str
    musteri: str
    tarih: date
    kalemler: list[SiparisKalemi] = field(default_factory=list)
    durum: SiparisDurumu = SiparisDurumu.TASLAK

    def toplam(self) -> Decimal:
        return sum((kalem.toplam() for kalem in self.kalemler), Decimal("0.00"))
`,
  "errors.py": `class VeriHatasi(Exception):
    pass
`,
  "repository.py": `import json
from pathlib import Path
from errors import VeriHatasi

class JsonSiparisDeposu:
    def __init__(self, yol: str):
        self.yol = Path(yol)

    def yukle(self) -> object:
        try:
            with self.yol.open("r", encoding="utf-8") as dosya:
                return json.load(dosya)
        except (OSError, json.JSONDecodeError) as error:
            raise VeriHatasi(str(error)) from error

    def kaydet(self, veri: object) -> None:
        self.yol.parent.mkdir(parents=True, exist_ok=True)
        with self.yol.open("w", encoding="utf-8") as dosya:
            json.dump(veri, dosya, ensure_ascii=False, indent=2)
`,
  "service.py": `from datetime import datetime
from decimal import Decimal, InvalidOperation
from errors import VeriHatasi
from models import Siparis, SiparisDurumu, SiparisKalemi


def siparis_olustur(veri: dict[str, object]) -> Siparis:
    try:
        siparis_id = str(veri["siparis_id"])
        musteri = str(veri["musteri"])
        tarih = datetime.strptime(str(veri["tarih"]), "%Y-%m-%d").date()
        durum = SiparisDurumu(str(veri.get("durum", "taslak")))
        ham_kalemler = veri["kalemler"]
        if not isinstance(ham_kalemler, list):
            raise VeriHatasi("Kalemler liste olmalı.")
        kalemler = []
        for ham in ham_kalemler:
            if not isinstance(ham, dict):
                raise VeriHatasi("Kalem sözlük olmalı.")
            adet = int(ham["adet"])
            fiyat = Decimal(str(ham["birim_fiyat"]))
            if adet <= 0 or fiyat <= 0:
                raise VeriHatasi("Adet ve fiyat pozitif olmalı.")
            kalemler.append(SiparisKalemi(str(ham["ad"]), fiyat, adet))
        return Siparis(siparis_id, musteri, tarih, kalemler, durum)
    except VeriHatasi:
        raise
    except (KeyError, ValueError, TypeError, InvalidOperation) as error:
        raise VeriHatasi(str(error)) from error


def siparisi_sozluge(siparis: Siparis) -> dict[str, object]:
    return {
        "siparis_id": siparis.siparis_id,
        "musteri": siparis.musteri,
        "tarih": siparis.tarih.isoformat(),
        "durum": siparis.durum.value,
        "toplam": f"{siparis.toplam():.2f}",
    }
`,
  "reporting.py": `from datetime import datetime, timedelta
from decimal import Decimal
from models import Siparis


def haftalik_rapor(
    siparisler: list[Siparis],
    referans: str,
    gun: int = 7,
) -> dict[str, object]:
    bitis = datetime.strptime(referans, "%Y-%m-%d").date()
    baslangic = bitis - timedelta(days=gun - 1)
    secilen = [siparis for siparis in siparisler if baslangic <= siparis.tarih <= bitis]
    toplam = sum((siparis.toplam() for siparis in secilen), Decimal("0.00"))
    return {
        "baslangic": baslangic.isoformat(),
        "bitis": bitis.isoformat(),
        "siparis_sayisi": len(secilen),
        "toplam": f"{toplam:.2f}",
        "musteriler": sorted({siparis.musteri for siparis in secilen}),
        "durum": "hazir" if secilen else "bos",
    }
`,
  "tests/test_service.py": `from decimal import Decimal
from errors import VeriHatasi
from models import Siparis
from service import siparis_olustur, siparisi_sozluge


def veri():
    return {"siparis_id": "T-1", "musteri": "Ada", "tarih": "2026-07-20", "durum": "tamamlandi", "kalemler": [{"ad": "Kalem", "birim_fiyat": "15.50", "adet": 2}]}


def test_gecerli():
    siparis = siparis_olustur(veri())
    assert isinstance(siparis, Siparis)
    assert siparis.toplam() == Decimal("31.00")


def test_sozluk():
    sonuc = siparisi_sozluge(siparis_olustur(veri()))
    assert sonuc["toplam"] == "31.00"
    assert sonuc["durum"] == "tamamlandi"


def test_gecersiz_adet():
    bozuk = veri()
    bozuk["kalemler"][0]["adet"] = 0
    try:
        siparis_olustur(bozuk)
        assert False
    except VeriHatasi:
        assert True


def test_eksik_alan():
    bozuk = veri()
    del bozuk["musteri"]
    try:
        siparis_olustur(bozuk)
        assert False
    except VeriHatasi:
        assert True
`,
  "tests/test_reporting.py": `from reporting import haftalik_rapor
from service import siparis_olustur


def veri(tarih="2026-07-20"):
    return {"siparis_id": "T-1", "musteri": "Ada", "tarih": tarih, "durum": "tamamlandi", "kalemler": [{"ad": "Kalem", "birim_fiyat": "15.50", "adet": 2}]}


def test_bos():
    rapor = haftalik_rapor([], "2026-07-23", 7)
    assert rapor["durum"] == "bos"
    assert rapor["toplam"] == "0.00"


def test_pencere():
    rapor = haftalik_rapor([siparis_olustur(veri())], "2026-07-23", 7)
    assert rapor["siparis_sayisi"] == 1
    assert rapor["toplam"] == "31.00"
    assert rapor["musteriler"] == ["Ada"]
`,
  "data/siparisler.json": "[]\n",
  "output/siparisler.json": "[]\n",
  "output/rapor.json": "{}\n",
};

describe("capstone validator integration", () => {
  it("validates the complete domain, persistence, typing and test contract", () => {
    const spec: TaskValidationSpec = {
      id: "integration.capstone",
      title: "Capstone integration",
      xpReward: 1,
      timeoutMs: 10000,
      checks: [
        {
          id: "quality",
          kind: "capstone_project",
          requiredFiles: Object.keys(files),
          testFiles: ["tests/test_service.py", "tests/test_reporting.py"],
          minTests: 6,
          minAssertions: 8,
          label: "Quality gate",
          visibility: "visible",
        },
      ],
    };

    const result = runValidator(files, spec);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.checks[0]?.passed).toBe(true);
  });

  it("rejects a project without sufficient tests", () => {
    const spec: TaskValidationSpec = {
      id: "integration.capstone-weak-tests",
      title: "Capstone weak tests",
      xpReward: 1,
      timeoutMs: 10000,
      checks: [
        {
          id: "quality",
          kind: "capstone_project",
          requiredFiles: Object.keys(files),
          testFiles: ["tests/test_service.py"],
          minTests: 8,
          minAssertions: 12,
          label: "Quality gate",
          visibility: "visible",
        },
      ],
    };

    const result = runValidator(files, spec);

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.passed).toBe(false);
  });
});
