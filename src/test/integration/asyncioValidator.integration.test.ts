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

function runValidator(
  files: Record<string, string>,
  entrypoint: string,
  spec: TaskValidationSpec,
) {
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-asyncio-"));
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
    throw new Error(execution.stderr || "Asyncio validator process failed.");
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

describe("asyncio validator integration", () => {
  it("validates async functions, coordination primitives and context cleanup", () => {
    const files = {
      "main.py": `import asyncio
from pipeline import collect

print(asyncio.run(collect([1, 2, 3])))
`,
      "session.py": `from contextlib import asynccontextmanager

@asynccontextmanager
async def session(log):
    log.append("açıldı")
    try:
        yield
    finally:
        log.append("kapandı")
`,
      "pipeline.py": `import asyncio
from session import session

async def fetch(value):
    await asyncio.sleep(0)
    return value * 2

async def worker(value, semaphore):
    async with semaphore:
        return await asyncio.wait_for(fetch(value), timeout=0.1)

async def collect(values):
    log = []
    async with session(log):
        semaphore = asyncio.Semaphore(2)
        tasks = [asyncio.create_task(worker(value, semaphore)) for value in values]
        results = await asyncio.gather(*tasks)
    return {"results": results, "log": log}
`,
    };

    const spec = {
      id: "integration.asyncio",
      title: "Asyncio integration",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "async-contract",
          kind: "advanced_patterns",
          requiredFiles: ["main.py", "pipeline.py", "session.py"],
          requireGather: true,
          requireCreateTask: true,
          requireWaitFor: true,
          requireSemaphore: true,
          requireAsyncWith: true,
          requireAsyncContextManager: true,
          asyncFunctions: [
            {
              name: "worker",
              file: "pipeline.py",
              minAwaitCount: 1,
              requiredCalls: ["wait_for"],
            },
            {
              name: "collect",
              file: "pipeline.py",
              minAwaitCount: 1,
              requiredCalls: ["Semaphore", "create_task", "gather"],
            },
          ],
          asyncScenarios: [
            {
              module: "pipeline",
              name: "collect",
              args: [[4, 1]],
              expected: {
                results: [8, 2],
                log: ["açıldı", "kapandı"],
              },
            },
          ],
          label: "Asyncio contract",
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
