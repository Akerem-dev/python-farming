import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskValidationResult, TaskValidationSpec } from "../../features/learning/taskValidationTypes";

const workspaces: string[] = [];
const validatorFilename = "__python_farming_exception_validator__.py";

function readValidatorSource() {
  const servicePath = resolve(
    process.cwd(),
    "src/features/learning/services/exceptionTaskValidationService.ts",
  );
  const serviceSource = readFileSync(servicePath, "utf-8");
  const match = serviceSource.match(
    /const VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) {
    throw new Error("Exception validator Python source could not be extracted.");
  }
  return match[1].replace(
    "${JSON.stringify(VALIDATOR_PATH)}",
    JSON.stringify(validatorFilename),
  );
}

function runValidator(source: string, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-exception-test-"));
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
    throw new Error(execution.stderr || "Exception validator process failed.");
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

describe("exception validator integration", () => {
  it("validates handlers, custom errors, returns and raised exceptions", () => {
    const source = `class StokHatasi(Exception):
    pass

def stok_azalt(stok, adet):
    if adet > stok:
        raise StokHatasi("Yetersiz stok.")
    return stok - adet

try:
    print(stok_azalt(10, 3))
except StokHatasi:
    print("Stok hatası")
`;
    const spec: TaskValidationSpec = {
      id: "integration.exception-validator",
      title: "Exception validator integration",
      xpReward: 1,
      timeoutMs: 4000,
      checks: [
        {
          id: "class",
          kind: "exception_class",
          name: "StokHatasi",
          base: "Exception",
          file: "main.py",
          label: "Custom exception",
          visibility: "visible",
        },
        {
          id: "handler",
          kind: "exception_handling",
          requiredTypes: ["StokHatasi"],
          minHandlers: 1,
          maxHandlers: 1,
          disallowBareExcept: true,
          file: "main.py",
          label: "Specific handler",
          visibility: "visible",
        },
        {
          id: "raise",
          kind: "raise_exception",
          name: "StokHatasi",
          min: 1,
          max: 1,
          file: "main.py",
          label: "Raise custom error",
          visibility: "visible",
        },
        {
          id: "valid-case",
          kind: "function_cases",
          name: "stok_azalt",
          cases: [{ args: [10, 3], expected: 7 }],
          label: "Valid case",
          visibility: "hidden",
        },
        {
          id: "error-case",
          kind: "function_raises",
          name: "stok_azalt",
          cases: [
            {
              args: [4, 7],
              exception: "StokHatasi",
              messagePattern: "Yetersiz stok",
            },
          ],
          label: "Error case",
          visibility: "hidden",
        },
        {
          id: "output",
          kind: "stdout_regex",
          pattern: "\\A7\\s*\\Z",
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

  it("rejects a bare except handler", () => {
    const source = `def oku(veri, anahtar):
    try:
        return veri[anahtar]
    except:
        return None

print(oku({}, "eksik"))
`;
    const spec: TaskValidationSpec = {
      id: "integration.bare-except",
      title: "Bare except rejection",
      xpReward: 1,
      timeoutMs: 4000,
      checks: [
        {
          id: "handler",
          kind: "exception_handling",
          requiredTypes: ["KeyError"],
          minHandlers: 1,
          maxHandlers: 1,
          disallowBareExcept: true,
          file: "main.py",
          label: "Specific handler",
          visibility: "visible",
        },
      ],
    };

    const result = runValidator(source, spec);

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.passed).toBe(false);
    expect(result.checks[0]?.message).toContain("KeyError");
  });
});
