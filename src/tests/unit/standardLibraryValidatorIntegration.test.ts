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
const validatorFilename = "__python_farming_standard_library_validator__.py";

function readValidatorSource() {
  const servicePath = resolve(
    process.cwd(),
    "src/features/learning/services/standardLibraryTaskValidationService.ts",
  );
  const serviceSource = readFileSync(servicePath, "utf-8");
  const match = serviceSource.match(
    /const VALIDATOR_SOURCE = String\.raw`([\s\S]*?)`;\n\nfunction createRequestId/,
  );
  if (!match?.[1]) {
    throw new Error("Standard library validator Python source could not be extracted.");
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
  const workspace = mkdtempSync(join(tmpdir(), "python-farming-stdlib-test-"));
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
    throw new Error(execution.stderr || "Standard library validator process failed.");
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

describe("standard library validator integration", () => {
  it("validates Decimal, date, aware datetime, Counter, Enum and decorators", () => {
    const files = {
      "main.py": `from collections import Counter
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from functools import lru_cache

class Durum(Enum):
    HAZIR = "hazir"
    BOS = "bos"

@lru_cache(maxsize=8)
def tarih(metin):
    return date.fromisoformat(metin)

def para(tutar):
    return Decimal(str(tutar)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def utc_zamani(metin):
    return datetime.fromisoformat(metin).astimezone(timezone.utc)

def frekans(veriler):
    return Counter(veriler)

print(para("12.345"))
`,
    };
    const spec: TaskValidationSpec = {
      id: "integration.standard-library",
      title: "Standard library integration",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "enum",
          kind: "enum_definition",
          name: "Durum",
          members: { HAZIR: "hazir", BOS: "bos" },
          label: "Enum",
          visibility: "visible",
        },
        {
          id: "decorator",
          kind: "decorator_usage",
          name: "tarih",
          accepted: ["lru_cache"],
          label: "Decorator",
          visibility: "visible",
        },
        {
          id: "decimal",
          kind: "stdlib_function_cases",
          name: "para",
          cases: [
            { args: ["12.345"], expected: "12.35", expectedType: "Decimal" },
            { args: ["0.1"], expected: "0.10", expectedType: "Decimal" },
          ],
          label: "Decimal",
          visibility: "hidden",
        },
        {
          id: "date",
          kind: "stdlib_function_cases",
          name: "tarih",
          cases: [
            { args: ["2026-08-01"], expected: "2026-08-01", expectedType: "date" },
          ],
          label: "Date",
          visibility: "hidden",
        },
        {
          id: "aware",
          kind: "stdlib_function_cases",
          name: "utc_zamani",
          cases: [
            {
              args: ["2026-07-22T12:00:00+03:00"],
              expected: "2026-07-22T09:00:00+00:00",
              expectedType: "datetime",
              timezoneAware: true,
            },
          ],
          label: "Aware datetime",
          visibility: "hidden",
        },
        {
          id: "counter",
          kind: "stdlib_function_cases",
          name: "frekans",
          cases: [
            {
              args: [["A", "B", "A"]],
              expected: { A: 2, B: 1 },
              expectedType: "Counter",
            },
          ],
          label: "Counter",
          visibility: "hidden",
        },
      ],
    };

    const result = runValidator(files, "main.py", spec);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("rejects wrong runtime types and naive datetimes", () => {
    const files = {
      "main.py": `from datetime import datetime

def para(tutar):
    return float(tutar)

def zaman():
    return datetime.fromisoformat("2026-07-22T09:00:00")
`,
    };
    const spec: TaskValidationSpec = {
      id: "integration.standard-library-rejection",
      title: "Standard library rejection",
      xpReward: 1,
      timeoutMs: 5000,
      checks: [
        {
          id: "decimal",
          kind: "stdlib_function_cases",
          name: "para",
          cases: [{ args: ["1.2"], expected: "1.20", expectedType: "Decimal" }],
          label: "Decimal",
          visibility: "visible",
        },
        {
          id: "aware",
          kind: "stdlib_function_cases",
          name: "zaman",
          cases: [
            {
              args: [],
              expectedType: "datetime",
              timezoneAware: true,
            },
          ],
          label: "Aware datetime",
          visibility: "visible",
        },
      ],
    };

    const result = runValidator(files, "main.py", spec);

    expect(result.passed).toBe(false);
    expect(result.checks.every((check) => !check.passed)).toBe(true);
  });
});
