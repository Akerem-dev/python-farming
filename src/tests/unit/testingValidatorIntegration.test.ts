import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskValidationResult, TaskValidationSpec } from "../../features/learning/taskValidationTypes";

const workspaces: string[] = [];
const validatorFilename = "__python_farming_testing_validator__.py";

function readValidatorSource() {
  const servicePath = resolve(
    process.cwd(),
    "src/features/learning/services/testingTaskValidationService.ts",
  );
  const serviceSource = readFileSync(servicePath, "utf-8");
  const match = serviceSource.match(
    /const VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) {
    throw new Error("Testing validator Python source could not be extracted.");
  }
  return match[1].replace(
    "${JSON.stringify(VALIDATOR_PATH)}",
    JSON.stringify(validatorFilename),
  );
}

function runValidator(files: Record<string, string>, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-testing-test-"));
  workspaces.push(workspace);
  writeFileSync(join(workspace, validatorFilename), readValidatorSource(), "utf-8");

  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(workspace, path);
    const directory = fullPath.slice(0, fullPath.lastIndexOf("/"));
    if (directory !== workspace) {
      spawnSync("mkdir", ["-p", directory]);
    }
    writeFileSync(fullPath, content, "utf-8");
  }

  const payload = {
    files: [validatorFilename, ...Object.keys(files)],
    entrypoint: Object.keys(files)[0],
    spec,
  };
  const execution = spawnSync("python3", [validatorFilename], {
    cwd: workspace,
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });

  if (execution.status !== 0) {
    throw new Error(execution.stderr || "Testing validator process failed.");
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

describe("testing validator integration", () => {
  it("runs parametrized and exception tests while killing mutants", () => {
    const files = {
      "dogrulama.py": `def adet_dogrula(adet):
    if not isinstance(adet, int):
        raise TypeError("Adet tam sayı olmalı.")
    if adet <= 0:
        raise ValueError("Adet pozitif olmalı.")
    return adet
`,
      "test_dogrulama.py": `import pytest
from dogrulama import adet_dogrula

@pytest.mark.parametrize("adet", [1, 2, 5])
def test_gecerli(adet):
    assert adet_dogrula(adet) == adet

def test_sifir():
    with pytest.raises(ValueError, match="pozitif"):
        adet_dogrula(0)

def test_metin():
    with pytest.raises(TypeError, match="tam sayı"):
        adet_dogrula("3")
`,
    };
    const spec: TaskValidationSpec = {
      id: "integration.testing-validator",
      title: "Testing validator integration",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "suite",
          kind: "test_suite",
          testFiles: ["test_dogrulama.py"],
          minTests: 3,
          minAssertions: 1,
          minParametrizeCases: 3,
          requireRaises: ["ValueError", "TypeError"],
          mutants: [
            {
              id: "zero-allowed",
              label: "Zero mutant",
              file: "dogrulama.py",
              source: `def adet_dogrula(adet):
    if not isinstance(adet, int):
        raise TypeError("Adet tam sayı olmalı.")
    if adet < 0:
        raise ValueError("Adet pozitif olmalı.")
    return adet
`,
            },
            {
              id: "wrong-type",
              label: "Type mutant",
              file: "dogrulama.py",
              source: `def adet_dogrula(adet):
    if not isinstance(adet, int):
        raise ValueError("Adet tam sayı olmalı.")
    if adet <= 0:
        raise ValueError("Adet pozitif olmalı.")
    return adet
`,
            },
          ],
          label: "Suite",
          visibility: "visible",
        },
      ],
    };

    const result = runValidator(files, spec);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("rejects a weak suite that passes a hidden mutant", () => {
    const files = {
      "hesaplama.py": "def topla(a, b):\n    return a + b\n",
      "test_hesaplama.py": `from hesaplama import topla

def test_topla():
    assert topla(0, 0) == 0
`,
    };
    const spec: TaskValidationSpec = {
      id: "integration.weak-suite",
      title: "Weak suite rejection",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "suite",
          kind: "test_suite",
          testFiles: ["test_hesaplama.py"],
          minTests: 1,
          minAssertions: 1,
          mutants: [
            {
              id: "constant-zero",
              label: "Constant zero mutant",
              file: "hesaplama.py",
              source: "def topla(a, b):\n    return 0\n",
            },
          ],
          label: "Suite",
          visibility: "visible",
        },
      ],
    };

    const result = runValidator(files, spec);

    expect(result.passed).toBe(false);
    expect(result.checks.at(-1)?.passed).toBe(false);
  });
});
