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
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-generator-"));
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
    throw new Error(execution.stderr || "Generator validator process failed.");
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

describe("generator validator integration", () => {
  it("validates yield from, send, throw, close and generator state", () => {
    const files = {
      "main.py": `from streams import sayac, birlestir

print(list(birlestir([[1, 2], [3]])))
akis = sayac()
print(next(akis))
print(akis.send(5))
print(akis.throw(ValueError("reset")))
akis.close()
`,
      "streams.py": `def birlestir(gruplar):
    for grup in gruplar:
        yield from grup


def sayac():
    toplam = 0
    try:
        while True:
            try:
                deger = yield toplam
                toplam += deger
            except ValueError:
                toplam = 0
    except GeneratorExit:
        raise
`,
    };

    const spec = {
      id: "integration.generators",
      title: "Generator integration",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "patterns",
          kind: "advanced_patterns",
          requiredFiles: ["main.py", "streams.py"],
          generators: [
            { name: "birlestir", file: "streams.py", minYieldCount: 1, requireYieldFrom: true },
            { name: "sayac", file: "streams.py", minYieldCount: 1 },
          ],
          scenarios: [
            {
              module: "streams",
              name: "birlestir",
              args: [[[1, 2], [], [3]]],
              actions: [{ kind: "collect", expected: [1, 2, 3] }],
            },
            {
              module: "streams",
              name: "sayac",
              args: [],
              actions: [
                { kind: "next", expected: 0 },
                { kind: "send", value: 8, expected: 8 },
                { kind: "throw", exception: "ValueError", message: "reset", expected: 0 },
                { kind: "close" },
                { kind: "state", expected: "GEN_CLOSED" },
              ],
            },
          ],
          label: "Generator lifecycle",
          visibility: "visible",
        },
      ],
    } as unknown as TaskValidationSpec;

    const result = runValidator(files, "main.py", spec);
    if (!result.passed) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    expect(result.score).toBe(100);
  });
});
