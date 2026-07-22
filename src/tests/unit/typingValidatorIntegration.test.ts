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
const validatorFilename = "__python_farming_typing_validator__.py";

function readValidatorSource() {
  const servicePath = resolve(
    process.cwd(),
    "src/features/learning/services/typingTaskValidationService.ts",
  );
  const serviceSource = readFileSync(servicePath, "utf-8");
  const match = serviceSource.match(
    /const VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) {
    throw new Error("Typing validator Python source could not be extracted.");
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
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-typing-test-"));
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
    throw new Error(execution.stderr || "Typing validator process failed.");
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

describe("typing validator integration", () => {
  it("validates annotations, protocol, dataclass fields and hidden behavior", () => {
    const files = {
      "main.py": `from service import ozet

print(ozet([{"ad": "Defter", "fiyat": 45.0, "adet": 2}]))
`,
      "models.py": `from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

@runtime_checkable
class Toplanabilir(Protocol):
    def toplam(self) -> float:
        ...

@dataclass(frozen=True)
class Urun:
    ad: str
    fiyat: float
    adet: int = 1
    etiketler: list[str] = field(default_factory=list)

    def toplam(self) -> float:
        return self.fiyat * self.adet
`,
      "service.py": `from models import Urun

def ozet(veriler: list[dict[str, object]]) -> float:
    return sum(Urun(v["ad"], v["fiyat"], v.get("adet", 1)).toplam() for v in veriler)
`,
    };
    const spec: TaskValidationSpec = {
      id: "integration.typing-validator",
      title: "Typing validator integration",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "protocol",
          kind: "protocol_definition",
          name: "Toplanabilir",
          file: "models.py",
          runtimeCheckable: true,
          methods: [{ name: "toplam", returnAccepted: ["float"] }],
          label: "Protocol",
          visibility: "visible",
        },
        {
          id: "model",
          kind: "dataclass_definition",
          name: "Urun",
          file: "models.py",
          frozen: true,
          fields: [
            { name: "ad", accepted: ["str"], defaultKind: "required" },
            { name: "fiyat", accepted: ["float"], defaultKind: "required" },
            { name: "adet", accepted: ["int"], defaultKind: "value" },
            {
              name: "etiketler",
              accepted: ["list[str]"],
              defaultKind: "factory",
              factory: "list",
            },
          ],
          requiredMethods: ["toplam"],
          label: "Dataclass",
          visibility: "visible",
        },
        {
          id: "signature",
          kind: "function_annotations",
          name: "ozet",
          file: "service.py",
          parameters: [
            { name: "veriler", accepted: ["list[dict[str, object]]"] },
          ],
          returnAccepted: ["float"],
          requireAllParameters: true,
          label: "Signature",
          visibility: "visible",
        },
        {
          id: "cases",
          kind: "function_cases",
          name: "ozet",
          module: "service",
          cases: [
            {
              args: [[{ ad: "Defter", fiyat: 45, adet: 2 }]],
              expected: 90,
            },
            { args: [[]], expected: 0 },
          ],
          label: "Cases",
          visibility: "hidden",
        },
        {
          id: "frozen",
          kind: "class_cases",
          name: "Urun",
          module: "models",
          cases: [
            {
              initArgs: ["Kalem", 15, 1, []],
              actions: [{ kind: "setattr", name: "adet", value: 2 }],
              observe: { kind: "attribute", name: "adet" },
              exception: "FrozenInstanceError",
            },
          ],
          label: "Frozen",
          visibility: "hidden",
        },
        {
          id: "output",
          kind: "stdout_regex",
          pattern: "90",
          label: "Output",
          visibility: "hidden",
        },
      ],
    };

    const result = runValidator(files, "main.py", spec);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("rejects incorrect annotations", () => {
    const files = {
      "main.py": `def donustur(deger: int) -> str:
    return str(deger)

print(donustur(3))
`,
    };
    const spec: TaskValidationSpec = {
      id: "integration.typing-rejection",
      title: "Typing rejection",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "signature",
          kind: "function_annotations",
          name: "donustur",
          parameters: [{ name: "deger", accepted: ["str"] }],
          returnAccepted: ["str"],
          requireAllParameters: true,
          label: "Signature",
          visibility: "visible",
        },
      ],
    };

    const result = runValidator(files, "main.py", spec);

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.passed).toBe(false);
  });
});
