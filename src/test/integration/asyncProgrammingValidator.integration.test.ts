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

const workspaces: string[] = [];
const validatorFilename = "__python_farming_async_validator__.py";

function readValidatorSource() {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "src/features/learning/services/asyncProgrammingTaskValidationService.ts",
    ),
    "utf-8",
  );
  const match = source.match(
    /const VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) {
    throw new Error("Async validator source could not be extracted.");
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
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-async-"));
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
    throw new Error(execution.stderr || "Async validator process failed.");
  }
  return JSON.parse(execution.stdout) as TaskValidationResult;
}

afterEach(() => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  }
});

describe("async programming validator integration", () => {
  it("validates gather timing, timeout and cancellation cleanup", () => {
    const files = {
      "main.py": `import asyncio
from worker import toplu_getir


async def main():
    print(await toplu_getir([("a", 0), ("b", 0)]))


if __name__ == "__main__":
    asyncio.run(main())
`,
      "worker.py": `import asyncio


async def tek(ad, gecikme):
    await asyncio.sleep(gecikme)
    return ad


async def toplu_getir(gorevler):
    return await asyncio.gather(*(tek(ad, gecikme) for ad, gecikme in gorevler))


async def guvenli(gecikme, timeout=0.02):
    try:
        return await asyncio.wait_for(tek("ok", gecikme), timeout)
    except asyncio.TimeoutError:
        return "timeout"


async def izlenen(iz):
    iz.append("başladı")
    try:
        await asyncio.sleep(1)
    except asyncio.CancelledError:
        iz.append("temizlendi")
        raise
`,
    };

    const spec = {
      id: "integration.async",
      title: "Async integration",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "async-contract",
          kind: "async_programming",
          requiredFiles: ["main.py", "worker.py"],
          asyncFunctions: [
            {
              name: "toplu_getir",
              file: "worker.py",
              minAwaitCount: 1,
              requiredCalls: ["asyncio.gather"],
            },
            {
              name: "guvenli",
              file: "worker.py",
              minAwaitCount: 1,
              requiredCalls: ["asyncio.wait_for"],
            },
            {
              name: "izlenen",
              file: "worker.py",
              minAwaitCount: 1,
            },
          ],
          scenarios: [
            {
              module: "worker",
              name: "toplu_getir",
              args: [[["a", 0.02], ["b", 0.02], ["c", 0.02]]],
              action: "call",
              expected: ["a", "b", "c"],
              maxDurationMs: 70,
            },
            {
              module: "worker",
              name: "guvenli",
              args: [0.05, 0.005],
              action: "call",
              expected: "timeout",
            },
            {
              module: "worker",
              name: "izlenen",
              args: [[]],
              action: "cancel",
              cancelAfterMs: 0,
              expectedException: "CancelledError",
              observeArgIndex: 0,
              expected: ["başladı", "temizlendi"],
            },
          ],
          label: "Async lifecycle",
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

  it("rejects blocking time.sleep inside async code", () => {
    const files = {
      "main.py": `import asyncio
import time


async def bekle():
    time.sleep(0.01)
    return "ok"


if __name__ == "__main__":
    print(asyncio.run(bekle()))
`,
    };
    const spec = {
      id: "integration.async.blocking",
      title: "Blocking call",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "async-contract",
          kind: "async_programming",
          requiredFiles: ["main.py"],
          asyncFunctions: [
            {
              name: "bekle",
              file: "main.py",
              disallowCalls: ["time.sleep"],
            },
          ],
          scenarios: [],
          label: "Blocking call",
          visibility: "visible",
        },
      ],
    } as unknown as TaskValidationSpec;

    const result = runValidator(files, "main.py", spec);
    expect(result.passed).toBe(false);
    expect(result.checks[0]?.message).toContain("time.sleep");
  });
});
