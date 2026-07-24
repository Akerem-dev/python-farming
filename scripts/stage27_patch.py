from __future__ import annotations

import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


# 1) TaskCheck union
path = root / "src/features/learning/taskValidationTypes.ts"
text = path.read_text(encoding="utf-8")
if 'kind: "async_programming"' not in text:
    async_union = '''  | (TaskCheckBase & {
      kind: "async_programming";
      requiredFiles: string[];
      asyncFunctions?: Array<{
        name: string;
        file?: string;
        minAwaitCount?: number;
        minAsyncForCount?: number;
        minAsyncWithCount?: number;
        requiredCalls?: string[];
        disallowCalls?: string[];
      }>;
      scenarios?: Array<{
        module: string;
        name: string;
        args: TaskCaseValue[];
        kwargs?: { [key: string]: TaskCaseValue };
        action: "call" | "collect" | "cancel";
        expected?: TaskCaseValue;
        expectedException?: string;
        maxDurationMs?: number;
        cancelAfterMs?: number;
        observeArgIndex?: number;
      }>;
    })
'''
    needle = '  | (TaskCheckBase & {\n      kind: "file_exists";'
    require(needle in text, "taskValidationTypes insertion point not found")
    text = text.replace(needle, async_union + needle, 1)
    path.write_text(text, encoding="utf-8")
    print("patched taskValidationTypes.ts")

# 2) Store import
path = root / "src/features/learning/store/taskValidationStore.ts"
text = path.read_text(encoding="utf-8")
async_import = 'import { validateAsyncProgrammingTask } from "../services/asyncProgrammingTaskValidationService";\n'
if async_import not in text:
    needle = 'import { validateAdvancedPatternTask } from "../services/advancedPatternTaskValidationService";\n'
    require(needle in text, "store import insertion point not found")
    text = text.replace(needle, needle + async_import, 1)

# 3) Store predicate
if "function requiresAsyncProgrammingValidation" not in text:
    predicate = '''function requiresAsyncProgrammingValidation(spec: TaskValidationSpec) {
  return spec.checks.some((check) => check.kind === "async_programming");
}

'''
    needle = "function requiresAdvancedPatternValidation(spec: TaskValidationSpec)"
    index = text.find(needle)
    require(index >= 0, "store predicate insertion point not found")
    text = text[:index] + predicate + text[index:]

# 4) Store dispatch
if "? await validateAsyncProgrammingTask" not in text:
    pattern = re.compile(
        r": requiresAdvancedPatternValidation\(spec\)\s*\n\s*\? await validateAdvancedPatternTask\(\{ files, entrypoint, spec \}\)"
    )
    replacement = ''': requiresAsyncProgrammingValidation(spec)
                 ? await validateAsyncProgrammingTask({ files, entrypoint, spec })
               : requiresAdvancedPatternValidation(spec)
                 ? await validateAdvancedPatternTask({ files, entrypoint, spec })'''
    text, count = pattern.subn(replacement, text, count=1)
    require(count == 1, "store dispatch insertion point not found")

path.write_text(text, encoding="utf-8")
print("patched taskValidationStore.ts")

# 5) Module package index
path = root / "public/content/module-packages.json"
data = json.loads(path.read_text(encoding="utf-8"))
entry = "/content/modules/async-await.json"
if entry not in data["files"]:
    data["files"].append(entry)
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("patched module-packages.json")
