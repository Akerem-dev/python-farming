import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskValidationResult, TaskValidationSpec } from "../../features/learning/taskValidationTypes";

const workspaces: string[] = [];
const validatorFilename = "__python_farming_advanced_pattern_validator__.py";

function readValidatorSource() {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "src/features/learning/services/advancedPatternTaskValidationService.ts",
    ),
    "utf-8",
  );
  const match = source.match(
    /const VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) {
    throw new Error("Advanced pattern validator source could not be extracted.");
  }
  return match[1].replace(
    "${JSON.stringify(VALIDATOR_PATH)}",
    JSON.stringify(validatorFilename),
  );
}

function runValidator(files: Record<string, string>, entrypoint: string, spec: TaskValidationSpec) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-advanced-pattern-"));
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
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

describe("advanced pattern validator integration", () => {
  it("validates wraps, decorated functions and generator context managers", () => {
    const files = {
      "main.py": `from pipeline import rapor_uret
print(rapor_uret([1, 2, 3], "output/log.txt"))
`,
      "patterns.py": `from functools import wraps

def olc(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper
`,
      "resources.py": `from contextlib import contextmanager
from pathlib import Path

@contextmanager
def guvenli_log(yol):
    Path(yol).parent.mkdir(parents=True, exist_ok=True)
    dosya = open(yol, "w", encoding="utf-8")
    try:
        yield dosya
    finally:
        dosya.close()
`,
      "pipeline.py": `from patterns import olc
from resources import guvenli_log

@olc
def rapor_uret(veriler, log_yolu):
    with guvenli_log(log_yolu) as log:
        log.write("başladı\n")
        sonuc = sum(veriler)
        log.write("bitti\n")
    return sonuc
`,
    };
    const spec: TaskValidationSpec = {
      id: "integration.advanced-pattern",
      title: "Advanced pattern integration",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "patterns",
          kind: "advanced_patterns",
          requiredFiles: ["patterns.py", "resources.py", "pipeline.py"],
          decorators: [
            { name: "olc", file: "patterns.py", requireWraps: true, minNestedFunctions: 1 },
          ],
          decoratedFunctions: [
            { name: "rapor_uret", decorator: "olc", file: "pipeline.py" },
          ],
          contextManagers: [
            { name: "guvenli_log", file: "resources.py", implementation: "generator" },
          ],
          functionCases: [
            {
              module: "pipeline",
              name: "rapor_uret",
              args: [[4, 5], "output/hidden.txt"],
              expected: 9,
            },
          ],
          generatedFiles: [{ path: "output/log.txt", pattern: "başladı.*bitti" }],
          label: "Advanced patterns",
          visibility: "visible",
        },
      ],
    };

    const result = runValidator(files, "main.py", spec);
    if (!result.passed) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    expect(result.score).toBe(100);
  });
});
