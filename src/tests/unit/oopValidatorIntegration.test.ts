import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskValidationResult, TaskValidationSpec } from "../../features/learning/taskValidationTypes";

const workspaces: string[] = [];
const validatorFilename = "__python_farming_oop_validator__.py";

function readValidatorSource() {
  const servicePath = resolve(
    process.cwd(),
    "src/features/learning/services/oopTaskValidationService.ts",
  );
  const serviceSource = readFileSync(servicePath, "utf-8");
  const match = serviceSource.match(
    /const VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) {
    throw new Error("OOP validator Python source could not be extracted.");
  }
  return match[1].replace(
    "${JSON.stringify(VALIDATOR_PATH)}",
    JSON.stringify(validatorFilename),
  );
}

function runValidator(source: string, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-oop-test-"));
  workspaces.push(workspace);
  writeFileSync(join(workspace, validatorFilename), readValidatorSource(), "utf-8");
  writeFileSync(join(workspace, "main.py"), source, "utf-8");

  const payload = {
    files: [validatorFilename, "main.py"],
    entrypoint: "main.py",
    stdin: [],
    spec,
  };
  const execution = spawnSync("python3", [validatorFilename], {
    cwd: workspace,
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });

  if (execution.status !== 0) {
    throw new Error(execution.stderr || "OOP validator process failed.");
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

describe("OOP validator integration", () => {
  it("validates class structure, property setters and hidden object scenarios", () => {
    const source = `class Urun:
    def __init__(self, ad, fiyat):
        self.ad = ad
        self.fiyat = fiyat

    @property
    def fiyat(self):
        return self._fiyat

    @fiyat.setter
    def fiyat(self, deger):
        if deger <= 0:
            raise ValueError("Fiyat pozitif olmalı.")
        self._fiyat = deger

    def etiket(self):
        return f"{self.ad}: {self.fiyat} TL"

urun = Urun("Defter", 45)
print(urun.etiket())
`;
    const spec: TaskValidationSpec = {
      id: "integration.oop-validator",
      title: "OOP validator integration",
      xpReward: 1,
      timeoutMs: 4000,
      checks: [
        {
          id: "class",
          kind: "class_definition",
          name: "Urun",
          minInitParams: 2,
          maxInitParams: 2,
          requiredMethods: ["__init__", "etiket"],
          requiredProperties: ["fiyat"],
          requiredSetters: ["fiyat"],
          requiredAttributes: ["ad", "_fiyat"],
          file: "main.py",
          label: "Product model",
          visibility: "visible",
        },
        {
          id: "cases",
          kind: "class_cases",
          name: "Urun",
          cases: [
            {
              initArgs: ["Kalem", 15],
              actions: [{ kind: "setattr", name: "fiyat", value: 20 }],
              observe: { kind: "method", name: "etiket", args: [] },
              expected: "Kalem: 20 TL",
            },
            {
              initArgs: ["Kalem", 15],
              actions: [{ kind: "setattr", name: "fiyat", value: -1 }],
              observe: { kind: "attribute", name: "fiyat" },
              exception: "ValueError",
              messagePattern: "pozitif",
            },
          ],
          label: "Object cases",
          visibility: "hidden",
        },
        {
          id: "output",
          kind: "stdout_regex",
          pattern: "\\ADefter:\\s*45\\s*TL\\s*\\Z",
          label: "Output",
          visibility: "hidden",
        },
      ],
    };

    const result = runValidator(source, spec);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("rejects a method that forgot the self parameter", () => {
    const source = `class Sayac:
    def __init__(self):
        self.deger = 0

    def artir():
        self.deger += 1

sayac = Sayac()
print(sayac.deger)
`;
    const spec: TaskValidationSpec = {
      id: "integration.oop-missing-self",
      title: "Missing self rejection",
      xpReward: 1,
      timeoutMs: 4000,
      checks: [
        {
          id: "cases",
          kind: "class_cases",
          name: "Sayac",
          cases: [
            {
              initArgs: [],
              actions: [{ kind: "call", name: "artir", args: [] }],
              observe: { kind: "attribute", name: "deger" },
              expected: 1,
            },
          ],
          label: "Counter cases",
          visibility: "hidden",
        },
      ],
    };

    const result = runValidator(source, spec);

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.passed).toBe(false);
    expect(result.checks[0]?.message).toContain("TypeError");
  });
});
