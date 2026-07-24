import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

function readValidatorSource() {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "src/features/learning/services/projectTaskValidationService.ts",
    ),
    "utf-8",
  );
  const match = source.match(
    /const PROJECT_VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) {
    throw new Error("Project validator source could not be extracted.");
  }
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
  const lesson = modulePackage.lessons.find(
    (candidate) => candidate.id === "advanced.arch.layered-application-project",
  );
  if (!lesson) throw new Error("Architecture final lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-architecture-"));
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
    throw new Error(execution.stderr || "Architecture project validator failed.");
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

const referenceFiles = {
  "main.py": `from service import uygulama_raporu

if __name__ == "__main__":
    print(uygulama_raporu([], []))
`,
  "domain.py": `class Urun:
    def __init__(self, urun_id, ad, fiyat_kurus, stok):
        self.id = urun_id
        self.ad = ad
        self.fiyat_kurus = fiyat_kurus
        self.stok = stok
`,
  "ports.py": `class UrunRepositoryPort:
    def getir(self, urun_id):
        raise NotImplementedError

    def stok_azalt(self, urun_id, adet):
        raise NotImplementedError

    def stok_ozeti(self):
        raise NotImplementedError


class BildirimPortu:
    def gonder(self, musteri, toplam_kurus):
        raise NotImplementedError
`,
  "adapters.py": `from domain import Urun


class BellekUrunRepository:
    def __init__(self, veriler):
        self._urunler = {
            veri["id"]: Urun(
                veri["id"], veri["ad"], veri["fiyat_kurus"], veri["stok"]
            )
            for veri in veriler
        }

    def getir(self, urun_id):
        if urun_id not in self._urunler:
            raise ValueError("Ürün bulunamadı.")
        return self._urunler[urun_id]

    def stok_azalt(self, urun_id, adet):
        urun = self.getir(urun_id)
        if adet <= 0 or urun.stok < adet:
            raise ValueError("Yetersiz stok.")
        urun.stok -= adet

    def stok_ozeti(self):
        return {
            urun.ad: urun.stok
            for urun in sorted(self._urunler.values(), key=lambda item: item.ad)
        }


class KayitBildirimAdapter:
    def __init__(self):
        self.mesajlar = []

    def gonder(self, musteri, toplam_kurus):
        self.mesajlar.append(f"{musteri}:{toplam_kurus}")
`,
  "strategies.py": `class StandartIndirim:
    def uygula(self, tutar):
        return tutar


class PremiumIndirim:
    def uygula(self, tutar):
        return tutar * 85 // 100


def strategy_olustur(kanal):
    kanal = kanal.lower()
    if kanal == "standart":
        return StandartIndirim()
    if kanal == "premium":
        return PremiumIndirim()
    raise ValueError("Bilinmeyen kanal.")
`,
  "service.py": `from adapters import BellekUrunRepository, KayitBildirimAdapter
from strategies import strategy_olustur


class SiparisServisi:
    def __init__(self, repository, bildirim):
        self.repository = repository
        self.bildirim = bildirim

    def siparis_ver(self, musteri, strategy, satirlar):
        ara_toplam = 0
        for satir in satirlar:
            urun = self.repository.getir(satir["urun_id"])
            adet = int(satir["adet"])
            if adet <= 0 or urun.stok < adet:
                raise ValueError("Yetersiz stok.")
            ara_toplam += urun.fiyat_kurus * adet

        for satir in satirlar:
            self.repository.stok_azalt(satir["urun_id"], int(satir["adet"]))

        toplam = strategy.uygula(ara_toplam)
        self.bildirim.gonder(musteri, toplam)
        return toplam


def uygulama_raporu(urunler, siparisler):
    repository = BellekUrunRepository(urunler)
    bildirim = KayitBildirimAdapter()
    servis = SiparisServisi(repository, bildirim)
    siparis_sayisi = 0
    reddedilen = 0
    toplam_kurus = 0

    for siparis in siparisler:
        try:
            strategy = strategy_olustur(siparis["kanal"])
            toplam = servis.siparis_ver(
                siparis["musteri"], strategy, siparis["satirlar"]
            )
        except ValueError:
            reddedilen += 1
            continue
        siparis_sayisi += 1
        toplam_kurus += toplam

    return {
        "siparis_sayisi": siparis_sayisi,
        "reddedilen": reddedilen,
        "toplam_kurus": toplam_kurus,
        "stoklar": repository.stok_ozeti(),
        "bildirimler": list(bildirim.mesajlar),
    }
`,
};

describe("architecture patterns project integration", () => {
  it("passes the layered reference solution", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded report that bypasses the layers", () => {
    const weakFiles = {
      ...referenceFiles,
      "service.py": `def uygulama_raporu(urunler, siparisler):
    return {
        "siparis_sayisi": 2,
        "reddedilen": 0,
        "toplam_kurus": 4700,
        "stoklar": {"Defter": 4, "Kalem": 5},
        "bildirimler": ["Ada:3000", "Mert:1700"],
    }
`,
    };
    const result = runValidator(weakFiles, finalSpec());
    expect(result.passed).toBe(false);
  });
});
