from pathlib import Path
from textwrap import dedent


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    if old not in source:
        raise SystemExit(f"Patch target missing in {path}: {old[:100]!r}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


service = Path("src/features/curriculum/services/curriculumService.ts")
replace_once(
    service,
    '  "file-processing",\n]);',
    '  "file-processing",\n  "test-lab",\n]);',
)

testing_validation = dedent(
    '''

      if (mode === "test-lab") {
        const guide = lesson.testing;
        if (
          !guide ||
          typeof guide.labTitle !== "string" ||
          typeof guide.objective !== "string" ||
          !Array.isArray(guide.sourceFiles) ||
          guide.sourceFiles.length === 0 ||
          guide.sourceFiles.some((path) => typeof path !== "string" || !isSafeWorkspacePath(path)) ||
          !Array.isArray(guide.testFiles) ||
          guide.testFiles.length === 0 ||
          guide.testFiles.some(
            (path) =>
              typeof path !== "string" ||
              !isSafeWorkspacePath(path) ||
              !path.endsWith(".py") ||
              !path.split("/").at(-1)?.startsWith("test_"),
          ) ||
          !Array.isArray(guide.principles) ||
          guide.principles.length < 2 ||
          guide.principles.some((principle) => typeof principle !== "string") ||
          !Array.isArray(guide.workflow) ||
          guide.workflow.length < 2 ||
          guide.workflow.some((step) => typeof step !== "string")
        ) {
          throw new Error(`${lesson.id} test laboratuvarı rehberi eksik.`);
        }

        const workspacePaths = new Set(lesson.editor.files?.map((file) => file.path) ?? []);
        const referencedPaths = [...guide.sourceFiles, ...guide.testFiles];
        if (referencedPaths.some((path) => !workspacePaths.has(path))) {
          throw new Error(`${lesson.id} test laboratuvarı çalışma alanında eksik dosya içeriyor.`);
        }

        const suiteChecks = validation.checks.filter((check) => check.kind === "test_suite");
        if (suiteChecks.length === 0) {
          throw new Error(`${lesson.id} test laboratuvarı test_suite kontrolü içermiyor.`);
        }
        for (const check of suiteChecks) {
          if (
            check.testFiles.length === 0 ||
            check.testFiles.some((path) => !guide.testFiles.includes(path)) ||
            check.minTests < 1 ||
            check.minAssertions < 0 ||
            (check.minParametrizeCases !== undefined && check.minParametrizeCases < 0) ||
            check.mutants.length === 0 ||
            check.mutants.some(
              (mutant) =>
                typeof mutant.id !== "string" ||
                typeof mutant.label !== "string" ||
                typeof mutant.file !== "string" ||
                !workspacePaths.has(mutant.file) ||
                typeof mutant.source !== "string" ||
                mutant.source.length === 0,
            )
          ) {
            throw new Error(`${lesson.id} test paketi doğrulama verisi geçersiz.`);
          }
        }
      }
    '''
)
replace_once(
    service,
    "\n  if (lesson.graduation) {",
    testing_validation + "\n  if (lesson.graduation) {",
)

workspace = Path("src/pages/WorkspacePage/WorkspacePage.tsx")
replacements = [
    (
        'import { RefactoringGuide } from "../../features/refactoring/components/RefactoringGuide";\nimport { AppShell }',
        'import { RefactoringGuide } from "../../features/refactoring/components/RefactoringGuide";\nimport { TestingGuide } from "../../features/testing/components/TestingGuide";\nimport { AppShell }',
    ),
    (
        '  "file-processing": "Dosya laboratuvarı",\n} as const;',
        '  "file-processing": "Dosya laboratuvarı",\n  "test-lab": "Test laboratuvarı",\n} as const;',
    ),
    (
        '  const isFileProcessing = lessonMode === "file-processing";\n  const usesLocalAnswer',
        '  const isFileProcessing = lessonMode === "file-processing";\n  const isTestingLab = lessonMode === "test-lab";\n  const usesLocalAnswer',
    ),
    (
        "  const projectIntro =\n",
        '  const testingIntro =\n    ">>> Test Laboratuvarı hazır.\\n>>> Test paketi doğru uygulamada çalıştırılır ve gizli hatalı uygulamalara karşı yeniden sınanır.";\n  const projectIntro =\n',
    ),
    (
        ": isFileProcessing && !runtimeOutput && !runtimeError\n          ? fileProcessingIntro",
        ": isTestingLab && !runtimeOutput && !runtimeError\n          ? testingIntro\n          : isFileProcessing && !runtimeOutput && !runtimeError\n            ? fileProcessingIntro",
    ),
    (
        ': isFileProcessing\n            ? "Dosyaları Kontrol Et"',
        ': isTestingLab\n            ? "Testleri Çalıştır"\n            : isFileProcessing\n              ? "Dosyaları Kontrol Et"',
    ),
    (
        ': isFileProcessing\n        ? "Dosya projesini sıfırla"',
        ': isTestingLab\n        ? "Test dosyalarını sıfırla"\n        : isFileProcessing\n          ? "Dosya projesini sıfırla"',
    ),
    (
        ': isFileProcessing\n      ? "Dosya işlemini çalıştır"',
        ': isTestingLab\n      ? "Testleri Çalıştır"\n      : isFileProcessing\n        ? "Dosya işlemini çalıştır"',
    ),
    (
        ': isFileProcessing\n                        ? "Dosya / terminal çıktısı"',
        ': isTestingLab\n                        ? "Beklenen test sonucu"\n                        : isFileProcessing\n                          ? "Dosya / terminal çıktısı"',
    ),
    (
        "          {currentLesson.fileSystem ? (\n            <FileSystemGuide guide={currentLesson.fileSystem} />\n          ) : null}\n\n          <StdinPanel",
        "          {currentLesson.fileSystem ? (\n            <FileSystemGuide guide={currentLesson.fileSystem} />\n          ) : null}\n\n          {isTestingLab && currentLesson.testing ? (\n            <TestingGuide guide={currentLesson.testing} />\n          ) : null}\n\n          <StdinPanel",
    ),
    (
        'variant={usesLocalAnswer ? "primary" : undefined}',
        'variant={usesLocalAnswer || isTestingLab ? "primary" : undefined}',
    ),
    (
        "{!usesLocalAnswer ? (",
        "{!usesLocalAnswer && !isTestingLab ? (",
    ),
]

for old, new in replacements:
    replace_once(workspace, old, new)
