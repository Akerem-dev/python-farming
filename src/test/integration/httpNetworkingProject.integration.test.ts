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
import type {
  TaskValidationResult,
  TaskValidationSpec,
} from "../../features/learning/taskValidationTypes";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

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
      resolve(process.cwd(), "public/content/modules/networking-http.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
  const lesson = modulePackage.lessons.find(
    (candidate) => candidate.id === "advanced.http.final-client",
  );
  if (!lesson) throw new Error("HTTP final lesson not found.");
  return lesson.validation;
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-http-"));
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
    throw new Error(execution.stderr || "HTTP project validator failed.");
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

const transport = `class FakeTransport:
    def __init__(self, senaryo):
        self._senaryo = list(senaryo)
        self.calls = []

    def get(self, url, timeout=2, headers=None):
        self.calls.append({"url": url, "timeout": timeout, "headers": dict(headers or {})})
        if not self._senaryo:
            raise RuntimeError("Sahte transport yanıtı kalmadı.")
        sonuc = self._senaryo.pop(0)
        if sonuc.get("kind") == "timeout":
            raise TimeoutError("İstek zaman aşımına uğradı.")
        return {
            "status": int(sonuc.get("status", 200)),
            "headers": dict(sonuc.get("headers", {})),
            "body": sonuc.get("body", "{}"),
        }
`;

const referenceFiles = {
  "main.py": `from service import api_raporu

if __name__ == "__main__":
    print(api_raporu([{"status": 200, "body": '{"items": [], "next": null}'}], "https://api.local", "demo"))
`,
  "request_builder.py": `from urllib.parse import urlencode, urljoin


def url_olustur(temel_url, yol, parametreler=None):
    url = urljoin(temel_url.rstrip("/") + "/", yol.lstrip("/"))
    temiz = {anahtar: deger for anahtar, deger in (parametreler or {}).items() if deger is not None}
    if not temiz:
        return url
    return f"{url}?{urlencode(sorted(temiz.items()))}"


def header_olustur(token):
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}
`,
  "client.py": `import json

from request_builder import header_olustur, url_olustur


def json_getir(transport, beklemeler, temel_url, yol, token, parametreler=None, max_deneme=3):
    url = url_olustur(temel_url, yol, parametreler)
    for deneme in range(max_deneme):
        try:
            yanit = transport.get(url, timeout=2, headers=header_olustur(token))
            if yanit["status"] >= 500:
                raise TimeoutError("geçici sunucu hatası")
            if yanit["status"] >= 400:
                return {"items": [], "next": None}
            return json.loads(yanit["body"])
        except TimeoutError:
            if deneme == max_deneme - 1:
                return {"items": [], "next": None}
            beklemeler.append(round(0.1 * (2 ** deneme), 2))


def sayfalari_getir(transport, beklemeler, temel_url, yol, token, parametreler=None):
    items = []
    mevcut_yol = yol
    mevcut_parametreler = parametreler
    while mevcut_yol:
        veri = json_getir(
            transport,
            beklemeler,
            temel_url,
            mevcut_yol,
            token,
            mevcut_parametreler,
        )
        items.extend(veri.get("items", []))
        mevcut_yol = veri.get("next")
        mevcut_parametreler = None
    return items
`,
  "service.py": `from client import sayfalari_getir
from transport import FakeTransport


def api_raporu(senaryo, temel_url, token, kategori=None):
    transport = FakeTransport(senaryo)
    beklemeler = []
    urunler = sayfalari_getir(
        transport,
        beklemeler,
        temel_url,
        "/urunler",
        token,
        {"kategori": kategori} if kategori else None,
    )
    if kategori is not None:
        urunler = [urun for urun in urunler if urun.get("kategori") == kategori]
    return {
        "urun_sayisi": len(urunler),
        "toplam_stok": sum(int(urun.get("stok", 0)) for urun in urunler),
        "kategoriler": sorted({urun.get("kategori") for urun in urunler if urun.get("kategori")}),
        "istek_sayisi": len(transport.calls),
        "beklemeler": beklemeler,
    }
`,
  "transport.py": transport,
};

describe("HTTP networking project integration", () => {
  it("passes the layered offline HTTP reference solution", () => {
    const result = runValidator(referenceFiles, finalSpec());
    if (!result.passed) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    expect(result.score).toBe(100);
  });

  it("rejects a hard-coded report that only matches one visible example", () => {
    const weakFiles = {
      ...referenceFiles,
      "service.py": `def api_raporu(senaryo, temel_url, token, kategori=None):
    return {
        "urun_sayisi": 2,
        "toplam_stok": 7,
        "kategoriler": ["Aksesuar", "Kırtasiye"],
        "istek_sayisi": 3,
        "beklemeler": [0.1],
    }
`,
    };
    const result = runValidator(weakFiles, finalSpec());
    expect(result.passed).toBe(false);
  });
});
