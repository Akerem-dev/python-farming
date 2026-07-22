import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  TaskValidationResult,
  TaskValidationSpec,
} from "../../features/learning/taskValidationTypes";

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
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-inheritance-test-"));
  workspaces.push(workspace);
  writeFileSync(join(workspace, validatorFilename), readValidatorSource(), "utf-8");
  writeFileSync(join(workspace, "main.py"), source, "utf-8");

  const execution = spawnSync("python3", [validatorFilename], {
    cwd: workspace,
    input: JSON.stringify({
      files: [validatorFilename, "main.py"],
      entrypoint: "main.py",
      stdin: [],
      spec,
    }),
    encoding: "utf-8",
  });

  if (execution.status !== 0) {
    throw new Error(execution.stderr || "Inheritance validator process failed.");
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

describe("inheritance validator integration", () => {
  it("validates bases, overrides, super, classmethod and staticmethod", () => {
    const source = `class Odeme:
    oran = 0.02

    def __init__(self, tutar):
        if not self.tutar_gecerli(tutar):
            raise ValueError("Tutar pozitif olmalı.")
        self.tutar = tutar

    @classmethod
    def oran_ayarla(cls, oran):
        cls.oran = oran

    @staticmethod
    def tutar_gecerli(tutar):
        return isinstance(tutar, (int, float)) and tutar > 0

    def komisyon(self):
        return 0

    def net_tutar(self):
        return self.tutar + self.komisyon()


class KrediKarti(Odeme):
    def __init__(self, tutar):
        super().__init__(tutar)

    def komisyon(self):
        return self.tutar * self.oran


Odeme.oran_ayarla(0.03)
kart = KrediKarti(1000)
print(kart.net_tutar())
`;
    const spec: TaskValidationSpec = {
      id: "integration.inheritance-validator",
      title: "Inheritance validator integration",
      xpReward: 1,
      timeoutMs: 4000,
      checks: [
        {
          id: "base",
          kind: "class_definition",
          name: "Odeme",
          minInitParams: 1,
          maxInitParams: 1,
          requiredMethods: ["__init__", "oran_ayarla", "tutar_gecerli", "komisyon"],
          requiredAttributes: ["tutar"],
          requiredClassMethods: ["oran_ayarla"],
          requiredStaticMethods: ["tutar_gecerli"],
          label: "Payment base",
          visibility: "visible",
        },
        {
          id: "child",
          kind: "class_definition",
          name: "KrediKarti",
          minInitParams: 1,
          maxInitParams: 1,
          requiredBases: ["Odeme"],
          requiredOverrides: ["komisyon"],
          requiredSuperCalls: ["__init__"],
          label: "Card inheritance",
          visibility: "visible",
        },
        {
          id: "cases",
          kind: "class_cases",
          name: "KrediKarti",
          cases: [
            {
              initArgs: [1000],
              observe: { kind: "method", name: "net_tutar", args: [] },
              expected: 1030,
            },
          ],
          label: "Card cases",
          visibility: "hidden",
        },
        {
          id: "output",
          kind: "stdout_regex",
          pattern: "\\A1030(?:\\.0)?\\s*\\Z",
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

  it("rejects a child constructor that does not call super", () => {
    const source = `class Urun:
    def __init__(self, ad):
        self.ad = ad


class IndirimliUrun(Urun):
    def __init__(self, ad, oran):
        self.oran = oran


urun = IndirimliUrun("Defter", 20)
print("hazır")
`;
    const spec: TaskValidationSpec = {
      id: "integration.inheritance-missing-super",
      title: "Missing super rejection",
      xpReward: 1,
      timeoutMs: 4000,
      checks: [
        {
          id: "child",
          kind: "class_definition",
          name: "IndirimliUrun",
          minInitParams: 2,
          maxInitParams: 2,
          requiredBases: ["Urun"],
          requiredSuperCalls: ["__init__"],
          label: "Discount product inheritance",
          visibility: "visible",
        },
      ],
    };

    const result = runValidator(source, spec);

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.passed).toBe(false);
    expect(result.checks[0]?.message).toContain("super() çağrısı");
  });
});
