import json
from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"Expected block not found in {path}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Curriculum roadmap
curriculum_path = Path("public/content/curriculum.json")
curriculum = json.loads(curriculum_path.read_text(encoding="utf-8"))
level_ids = {level["id"] for level in curriculum["levels"]}
if "advanced" not in level_ids:
    curriculum["levels"].append({
        "id": "advanced",
        "title": "İleri Seviye",
        "modules": [
            {"id": "decorators-context-managers", "number": "01", "title": "Decorator ve Context Manager", "lessonIds": []},
            {"id": "generators-coroutines", "number": "02", "title": "Generator ve Coroutine", "lessonIds": []},
            {"id": "asyncio", "number": "03", "title": "Asyncio ve Eşzamanlılık", "lessonIds": []},
            {"id": "threads-processes", "number": "04", "title": "Thread ve Process", "lessonIds": []},
            {"id": "descriptors-data-model", "number": "05", "title": "Descriptor ve Veri Modeli", "lessonIds": []},
            {"id": "metaprogramming", "number": "06", "title": "Metaprogramlama", "lessonIds": []},
            {"id": "performance-profiling", "number": "07", "title": "Performans ve Profiling", "lessonIds": []},
            {"id": "advanced-project", "number": "08", "title": "İleri Seviye Projesi", "lessonIds": []},
        ],
    })
if "expert" not in level_ids:
    curriculum["levels"].append({
        "id": "expert",
        "title": "Uzman Seviye",
        "modules": [
            {"id": "software-architecture", "number": "01", "title": "Yazılım Mimarisi", "lessonIds": []},
            {"id": "packaging-distribution", "number": "02", "title": "Paketleme ve Dağıtım", "lessonIds": []},
            {"id": "database-transactions", "number": "03", "title": "Veritabanı ve Transaction", "lessonIds": []},
            {"id": "api-networking", "number": "04", "title": "API ve Ağ Programlama", "lessonIds": []},
            {"id": "security-observability", "number": "05", "title": "Güvenlik ve Gözlemlenebilirlik", "lessonIds": []},
            {"id": "expert-project", "number": "06", "title": "Uzmanlık Projesi", "lessonIds": []},
        ],
    })
curriculum_path.write_text(json.dumps(curriculum, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# Task validation types
validation_types = "src/features/learning/taskValidationTypes.ts"
replace_once(
    validation_types,
    "interface TaskCheckBase {",
    '''export interface TaskPatternCase {\n  args: TaskCaseValue[];\n  kwargs?: { [key: string]: TaskCaseValue };\n  expected?: TaskCaseValue;\n  outputPattern?: string;\n}\n\nexport interface TaskDecoratorTargetExpectation {\n  name: string;\n  module?: string;\n  expectedName?: string;\n  expectedDoc?: string;\n  cases: TaskPatternCase[];\n}\n\nexport interface TaskContextProbeExpectation {\n  name: string;\n  module?: string;\n  cases: TaskPatternCase[];\n}\n\ninterface TaskCheckBase {''',
)
replace_once(
    validation_types,
    '''  | (TaskCheckBase & {\n      kind: "class_cases";''',
    '''  | (TaskCheckBase & {\n      kind: "decorator_contract";\n      name: string;\n      file?: string;\n      parameterized: boolean;\n      requireWraps: boolean;\n      targets: TaskDecoratorTargetExpectation[];\n    })\n  | (TaskCheckBase & {\n      kind: "context_manager_contract";\n      name: string;\n      file?: string;\n      module?: string;\n      implementation: "class" | "generator";\n      enterReturnsSelf?: boolean;\n      exitSuppresses?: boolean;\n      requireTryFinally?: boolean;\n      initArgs?: TaskCaseValue[];\n      probe?: TaskContextProbeExpectation;\n    })\n  | (TaskCheckBase & {\n      kind: "resource_management_project";\n      requiredFiles: string[];\n      decoratorName: string;\n      contextManagerName: string;\n      functionName: string;\n      functionModule: string;\n    })\n  | (TaskCheckBase & {\n      kind: "class_cases";''',
)


# Validation store routing
store_path = "src/features/learning/store/taskValidationStore.ts"
replace_once(
    store_path,
    'import { create } from "zustand";\n',
    'import { create } from "zustand";\nimport { validateAdvancedPatternTask } from "../services/advancedPatternTaskValidationService";\n',
)
replace_once(
    store_path,
    '''function requiresCapstoneValidation(spec: TaskValidationSpec) {''',
    '''function requiresAdvancedPatternValidation(spec: TaskValidationSpec) {\n  const advancedChecks = new Set([\n    "decorator_contract",\n    "context_manager_contract",\n    "resource_management_project",\n  ]);\n  return spec.checks.some((check) => advancedChecks.has(check.kind));\n}\n\nfunction requiresCapstoneValidation(spec: TaskValidationSpec) {''',
)
replace_once(
    store_path,
    ''': requiresCapstoneValidation(spec)\n              ? await validateCapstoneTask({ files, entrypoint, stdin, spec })''',
    ''': requiresAdvancedPatternValidation(spec)\n              ? await validateAdvancedPatternTask({ files, entrypoint, stdin, spec })\n              : requiresCapstoneValidation(spec)\n                ? await validateCapstoneTask({ files, entrypoint, stdin, spec })''',
)


# Home page advanced progress
home_path = "src/pages/HomePage/HomePage.tsx"
replace_once(
    home_path,
    '''  const intermediateRoadmapProgress = Math.round((completedIntermediateModules / 10) * 100);\n  const completedPublishedModuleCount''',
    '''  const intermediateRoadmapProgress = Math.round((completedIntermediateModules / 10) * 100);\n  const advancedModules =\n    catalog?.levels.find((level) => level.id === "advanced")?.modules ?? [];\n  const completedAdvancedModules = advancedModules.filter((module) =>\n    isModuleCompleted(module, completedLessonIds),\n  ).length;\n  const advancedRoadmapProgress = Math.round((completedAdvancedModules / 8) * 100);\n  const completedPublishedModuleCount''',
)
replace_once(
    home_path,
    ''': isIntermediate\n          ? completedIntermediateModules\n          : 0,''',
    ''': isIntermediate\n          ? completedIntermediateModules\n          : isAdvanced\n            ? completedAdvancedModules\n            : 0,''',
)
replace_once(
    home_path,
    ''': isIntermediate\n          ? intermediateRoadmapProgress\n          : 0,''',
    ''': isIntermediate\n          ? intermediateRoadmapProgress\n          : isAdvanced\n            ? advancedRoadmapProgress\n            : 0,''',
)
replace_once(
    home_path,
    ''': resumeLevel?.id === "intermediate"\n          ? "Orta Seviye"\n          : "Başlangıç";''',
    ''': resumeLevel?.id === "advanced"\n          ? "İleri Seviye"\n          : resumeLevel?.id === "intermediate"\n            ? "Orta Seviye"\n            : "Başlangıç";''',
)
