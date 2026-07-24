from __future__ import annotations

import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]

# 1) TaskCheck union
path = root / "src/features/learning/taskValidationTypes.ts"
text = path.read_text(encoding="utf-8")
marker = '''  | (TaskCheckBase & {
      kind: "file_exists";
      path: string;
    })'''
insert = '''  | (TaskCheckBase & {
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
'''+marker
if 'kind: "async_programming"' not in text:
    if marker not in text:
        raise SystemExit("taskValidationTypes marker not found")
    text = text.replace(marker, insert, 1)
    path.write_text(text, encoding="utf-8")

# 2) Store import, predicate and dispatch
path = root / "src/features/learning/store/taskValidationStore.ts"
text = path.read_text(encoding="utf-8")
import_marker = 'import { validateAdvancedPatternTask } from "../services/advancedPatternTaskValidationService";\n'
async_import = 'import { validateAsyncProgrammingTask } from "../services/asyncProgrammingTaskValidationService";\n'
if async_import not in text:
    if import_marker not in text:
        raise SystemExit("store import marker not found")
    text = text.replace(import_marker, import_marker + async_import, 1)

predicate_marker = '''function requiresAdvancedPatternValidation(spec: TaskValidationSpec) {
  return spec.checks.some((check) => check.kind === "advanced_patterns");
}
'''
predicate = '''function requiresAsyncProgrammingValidation(spec: TaskValidationSpec) {
  return spec.checks.some((check) => check.kind === "async_programming");
}

'''
if "function requiresAsyncProgrammingValidation" not in text:
    if predicate_marker not in text:
        raise SystemExit("store predicate marker not found")
    text = text.replace(predicate_marker, predicate + predicate_marker, 1)

dispatch_marker = ''': requiresAdvancedPatternValidation(spec)
                 ? await validateAdvancedPatternTask({ files, entrypoint, spec })'''
dispatch = ''': requiresAsyncProgrammingValidation(spec)
                 ? await validateAsyncProgrammingTask({ files, entrypoint, spec })
               : requiresAdvancedPatternValidation(spec)
                 ? await validateAdvancedPatternTask({ files, entrypoint, spec })'''
if "? await validateAsyncProgrammingTask" not in text:
    if dispatch_marker not in text:
        raise SystemExit("store dispatch marker not found")
    text = text.replace(dispatch_marker, dispatch, 1)
path.write_text(text, encoding="utf-8")

# 3) Module package index
path = root / "public/content/module-packages.json"
data = json.loads(path.read_text(encoding="utf-8"))
entry = "/content/modules/async-await.json"
if entry not in data["files"]:
    data["files"].append(entry)
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
