import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadExceptionsPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/exceptions.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("exception handling module content", () => {
  const modulePackage = loadExceptionsPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("exceptions");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("covers prediction, debugging, custom exceptions and file processing", () => {
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "debugging")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "file-processing")).toBe(true);
    expect(
      modulePackage.lessons.some((lesson) =>
        lesson.validation.checks.some((check) => check.kind === "exception_class"),
      ),
    ).toBe(true);
  });

  it("requires explicit exception types and forbids bare except handlers", () => {
    const executableLessons = modulePackage.lessons.filter(
      (lesson) => lesson.mode !== "output-prediction",
    );

    for (const lesson of executableLessons) {
      const exceptionCheck = lesson.validation.checks.find(
        (check) => check.kind === "exception_handling",
      );
      expect(exceptionCheck?.kind).toBe("exception_handling");
      if (exceptionCheck?.kind === "exception_handling") {
        expect(exceptionCheck.requiredTypes.length).toBeGreaterThan(0);
        expect(exceptionCheck.disallowBareExcept).toBe(true);
      }
    }
  });

  it("tests both successful function results and raised exceptions", () => {
    const controlledRaise = modulePackage.lessons.find(
      (lesson) => lesson.id === "intermediate.exceptions.controlled-raise",
    );
    const customException = modulePackage.lessons.find(
      (lesson) => lesson.id === "intermediate.exceptions.custom-exception",
    );

    for (const lesson of [controlledRaise, customException]) {
      expect(
        lesson?.validation.checks.some((check) => check.kind === "function_cases"),
      ).toBe(true);
      expect(
        lesson?.validation.checks.some((check) => check.kind === "function_raises"),
      ).toBe(true);
    }
  });

  it("ships a resilient JSON transfer final project", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const paths = finalLesson?.editor.files?.map((file) => file.path) ?? [];
    const flowCheck = finalLesson?.validation.checks.find(
      (check) => check.kind === "exception_handling",
    );

    expect(finalLesson?.id).toBe("intermediate.exceptions.resilient-transfer");
    expect(paths).toEqual(
      expect.arrayContaining([
        "main.py",
        "errors.py",
        "aktarim.py",
        "data/siparisler.json",
        "data/bozuk.json",
        "data/gecersiz.json",
        "output/rapor.json",
      ]),
    );
    expect(finalLesson?.validation.checks.some((check) => check.kind === "json_file_equals")).toBe(
      true,
    );
    expect(finalLesson?.validation.checks.some((check) => check.kind === "file_unchanged")).toBe(
      true,
    );
    expect(flowCheck?.kind).toBe("exception_handling");
    if (flowCheck?.kind === "exception_handling") {
      expect(flowCheck.requiredTypes).toEqual([
        "FileNotFoundError",
        "json.JSONDecodeError",
        "VeriHatasi",
      ]);
      expect(flowCheck.requireElse).toBe(true);
      expect(flowCheck.requireFinally).toBe(true);
    }
  });

  it("awards 555 XP across the complete module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(555);
  });
});
