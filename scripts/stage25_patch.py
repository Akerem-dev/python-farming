import json
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected block not found in {path}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


curriculum_path = Path("public/content/curriculum.json")
catalog = json.loads(curriculum_path.read_text(encoding="utf-8"))
if not any(level["id"] == "advanced" for level in catalog["levels"]):
    catalog["levels"].append({
        "id": "advanced",
        "title": "İleri Seviye",
        "modules": [
            {"id": "decorators-context-managers", "number": "01", "title": "Decorator ve Context Manager", "lessonIds": []},
            {"id": "generators-coroutines", "number": "02", "title": "Generator ve Coroutine", "lessonIds": []},
            {"id": "async-await", "number": "03", "title": "Async ve Await", "lessonIds": []},
            {"id": "networking-http", "number": "04", "title": "HTTP ve Ağ Programlama", "lessonIds": []},
            {"id": "databases-advanced", "number": "05", "title": "İleri Veritabanı", "lessonIds": []},
            {"id": "architecture-patterns", "number": "06", "title": "Mimari ve Tasarım Desenleri", "lessonIds": []},
            {"id": "packaging-performance", "number": "07", "title": "Paketleme ve Performans", "lessonIds": []},
            {"id": "advanced-project", "number": "08", "title": "İleri Seviye Projesi", "lessonIds": []},
        ],
    })
curriculum_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

index_path = Path("public/content/module-packages.json")
index = json.loads(index_path.read_text(encoding="utf-8"))
package_path = "/content/modules/decorators-context-managers.json"
if package_path not in index["files"]:
    index["files"].append(package_path)
index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

replace_once(
    "src/features/learning/taskValidationTypes.ts",
    '''  | (TaskCheckBase & {\n      kind: "file_exists";''',
    '''  | (TaskCheckBase & {\n      kind: "advanced_patterns";\n      requiredFiles: string[];\n      decorators?: Array<{\n        name: string;\n        file?: string;\n        minNestedFunctions?: number;\n        parameterized?: boolean;\n        requireWraps?: boolean;\n      }>;\n      decoratedFunctions?: Array<{\n        name: string;\n        decorator: string;\n        file?: string;\n      }>;\n      contextManagers?: Array<{\n        name: string;\n        file?: string;\n        implementation: "class" | "generator";\n      }>;\n      functionCases?: Array<{\n        module: string;\n        name: string;\n        args: TaskCaseValue[];\n        kwargs?: { [key: string]: TaskCaseValue };\n        expected: TaskCaseValue;\n      }>;\n      generatedFiles?: Array<{\n        path: string;\n        pattern?: string;\n      }>;\n    })\n  | (TaskCheckBase & {\n      kind: "file_exists";''',
)

store_path = "src/features/learning/store/taskValidationStore.ts"
replace_once(
    store_path,
    '''import { runtimeClient } from''',
    '''import { runtimeClient } from''',
) if False else None
replace_once(
    store_path,
    '''import { validateExceptionTask } from "../services/exceptionTaskValidationService";''',
    '''import { validateAdvancedPatternTask } from "../services/advancedPatternTaskValidationService";\nimport { validateExceptionTask } from "../services/exceptionTaskValidationService";''',
)
replace_once(
    store_path,
    '''function requiresTestingValidation(spec: TaskValidationSpec) {''',
    '''function requiresAdvancedPatternValidation(spec: TaskValidationSpec) {\n  return spec.checks.some((check) => check.kind === "advanced_patterns");\n}\n\nfunction requiresTestingValidation(spec: TaskValidationSpec) {''',
)
replace_once(
    store_path,
    '''            : requiresTestingValidation(spec)\n              ? await validateTestingTask({ files, entrypoint, spec })''',
    '''            : requiresAdvancedPatternValidation(spec)\n              ? await validateAdvancedPatternTask({ files, entrypoint, spec })\n              : requiresTestingValidation(spec)\n                ? await validateTestingTask({ files, entrypoint, spec })''',
)

home = Path("src/pages/HomePage/HomePage.tsx")
text = home.read_text(encoding="utf-8")
text = text.replace(
    '''  const intermediateRoadmapProgress = Math.round((completedIntermediateModules / 10) * 100);''',
    '''  const intermediateRoadmapProgress = Math.round((completedIntermediateModules / 10) * 100);\n  const advancedModules =\n    catalog?.levels.find((level) => level.id === "advanced")?.modules ?? [];\n  const completedAdvancedModules = advancedModules.filter((module) =>\n    isModuleCompleted(module, completedLessonIds),\n  ).length;\n  const advancedRoadmapProgress = Math.round((completedAdvancedModules / 8) * 100);''',
    1,
)
text = text.replace(
    '''          : 0,\n      progress: isBeginner\n        ? beginnerRoadmapProgress\n        : isIntermediate\n          ? intermediateRoadmapProgress\n          : 0,''',
    '''          : isAdvanced\n            ? completedAdvancedModules\n            : 0,\n      progress: isBeginner\n        ? beginnerRoadmapProgress\n        : isIntermediate\n          ? intermediateRoadmapProgress\n          : isAdvanced\n            ? advancedRoadmapProgress\n            : 0,''',
    1,
)
text = text.replace(
    ''': resumeLevel?.id === "intermediate"\n          ? "Orta Seviye"\n          : "Başlangıç";''',
    ''': resumeLevel?.id === "intermediate"\n          ? "Orta Seviye"\n          : resumeLevel?.id === "advanced"\n            ? "İleri Seviye"\n            : "Başlangıç";''',
    1,
)
home.write_text(text, encoding="utf-8")
