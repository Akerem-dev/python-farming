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
      resolve(
        process.cwd(),
        "public/content/modules/databases-advanced.json",
      ),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find(
    (candidate) => candidate.id === "advanced.db.order-database-project",
  );
  if (!lesson) throw new Error("Advanced database final lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-database-"));
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
    throw new Error(execution.stderr || "Database project validator failed.");
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
  "main.py": `from service import senaryo_calistir

if __name__ == "__main__":
    print(senaryo_calistir([], []))
`,
  "database.py": `import sqlite3
from pathlib import Path

MIGRATION_PATH = Path("migrations/001_init.txt")


def connection_olustur():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(MIGRATION_PATH.read_text(encoding="utf-8"))
    return connection
`,
  "repository.py": `def urunleri_yukle(connection, urunler):
    connection.executemany(
        "INSERT INTO urunler (id, ad, fiyat_kurus, stok) VALUES (?, ?, ?, ?)",
        [(item["id"], item["ad"], item["fiyat_kurus"], item["stok"]) for item in urunler],
    )


def urun_getir(connection, urun_id):
    row = connection.execute(
        "SELECT id, ad, fiyat_kurus, stok FROM urunler WHERE id = ?",
        (urun_id,),
    ).fetchone()
    if row is None:
        raise ValueError("ürün bulunamadı")
    return row


def siparis_baslat(connection, musteri):
    cursor = connection.execute(
        "INSERT INTO siparisler (musteri, toplam_kurus) VALUES (?, 0)",
        (musteri,),
    )
    return cursor.lastrowid


def siparis_satiri_ekle(connection, siparis_id, urun_id, adet, birim_fiyat_kurus):
    connection.execute(
        "INSERT INTO siparis_satirlari "
        "(siparis_id, urun_id, adet, birim_fiyat_kurus) VALUES (?, ?, ?, ?)",
        (siparis_id, urun_id, adet, birim_fiyat_kurus),
    )


def stok_azalt(connection, urun_id, adet):
    if adet <= 0:
        raise ValueError("adet pozitif olmalı")
    cursor = connection.execute(
        "UPDATE urunler SET stok = stok - ? WHERE id = ? AND stok >= ?",
        (adet, urun_id, adet),
    )
    if cursor.rowcount != 1:
        raise ValueError("yetersiz stok")


def siparis_toplamini_guncelle(connection, siparis_id, toplam_kurus):
    connection.execute(
        "UPDATE siparisler SET toplam_kurus = ? WHERE id = ?",
        (toplam_kurus, siparis_id),
    )
`,
  "service.py": `from database import connection_olustur
from repository import (
    siparis_baslat,
    siparis_satiri_ekle,
    siparis_toplamini_guncelle,
    stok_azalt,
    urun_getir,
    urunleri_yukle,
)


def senaryo_calistir(urunler, islemler):
    connection = connection_olustur()
    with connection:
        urunleri_yukle(connection, urunler)

    reddedilen = 0
    for islem in islemler:
        try:
            with connection:
                siparis_id = siparis_baslat(connection, islem["musteri"])
                toplam_kurus = 0
                for satir in islem.get("satirlar", []):
                    adet = int(satir["adet"])
                    if adet <= 0:
                        raise ValueError("adet pozitif olmalı")
                    urun = urun_getir(connection, satir["urun_id"])
                    stok_azalt(connection, satir["urun_id"], adet)
                    siparis_satiri_ekle(
                        connection,
                        siparis_id,
                        satir["urun_id"],
                        adet,
                        int(urun["fiyat_kurus"]),
                    )
                    toplam_kurus += int(urun["fiyat_kurus"]) * adet
                siparis_toplamini_guncelle(connection, siparis_id, toplam_kurus)
        except ValueError:
            reddedilen += 1

    siparis_sayisi, toplam_kurus = connection.execute(
        "SELECT COUNT(*), COALESCE(SUM(toplam_kurus), 0) FROM siparisler"
    ).fetchone()
    stoklar = {
        row["ad"]: row["stok"]
        for row in connection.execute("SELECT ad, stok FROM urunler ORDER BY ad")
    }
    connection.close()
    return {
        "siparis_sayisi": siparis_sayisi,
        "toplam_kurus": toplam_kurus,
        "stoklar": stoklar,
        "reddedilen": reddedilen,
    }
`,
  "migrations/001_init.txt": `PRAGMA foreign_keys = ON;

CREATE TABLE urunler (
    id INTEGER PRIMARY KEY,
    ad TEXT NOT NULL UNIQUE,
    fiyat_kurus INTEGER NOT NULL CHECK(fiyat_kurus >= 0),
    stok INTEGER NOT NULL CHECK(stok >= 0)
);

CREATE TABLE siparisler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    musteri TEXT NOT NULL,
    toplam_kurus INTEGER NOT NULL DEFAULT 0 CHECK(toplam_kurus >= 0)
);

CREATE TABLE siparis_satirlari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    siparis_id INTEGER NOT NULL,
    urun_id INTEGER NOT NULL,
    adet INTEGER NOT NULL CHECK(adet > 0),
    birim_fiyat_kurus INTEGER NOT NULL CHECK(birim_fiyat_kurus >= 0),
    FOREIGN KEY (siparis_id) REFERENCES siparisler(id) ON DELETE CASCADE,
    FOREIGN KEY (urun_id) REFERENCES urunler(id)
);

CREATE INDEX idx_urunler_stok ON urunler(stok);
`,
};

describe("advanced database project integration", () => {
  it("passes the transactional SQLite reference solution", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded summary that only matches the visible example", () => {
    const weakFiles = {
      ...referenceFiles,
      "service.py": `def senaryo_calistir(urunler, islemler):
    for _ in islemler:
        pass
    for _ in urunler:
        pass
    with open("migrations/001_init.txt", "r", encoding="utf-8"):
        return {
            "siparis_sayisi": 1,
            "toplam_kurus": 3500,
            "stoklar": {"Defter": 4, "Kalem": 8},
            "reddedilen": 0,
        }
`,
    };
    const result = runValidator(weakFiles, finalSpec());
    expect(result.passed).toBe(false);
  });
});
