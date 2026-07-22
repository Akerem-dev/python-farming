import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadTestingPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/testing.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("intermediate testing module content", () => {
  const modulePackage = loadTestingPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("testing");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("uses a dedicated test laboratory mode for executable testing lessons", () => {
    const executableLessons = modulePackage.lessons.filter(
      (lesson) => lesson.mode !== "output-prediction",
    );

    expect(executableLessons).toHaveLength(6);
    for (const lesson of executableLessons) {
      expect(lesson.mode).toBe("test-lab");
      expect(lesson.testing?.sourceFiles.length).toBeGreaterThan(0);
      expect(lesson.testing?.testFiles.length).toBeGreaterThan(0);
      expect(lesson.validation.checks.some((check) => check.kind === "test_suite")).toBe(true);
    }
  });

  it("requires explicit exception and parametrized test coverage", () => {
    const exceptionLesson = modulePackage.lessons.find(
      (lesson) => lesson.id === "intermediate.testing.exception-tests",
    );
    const exceptionCheck = exceptionLesson?.validation.checks.find(
      (check) => check.kind === "test_suite",
    );
    expect(exceptionCheck?.kind).toBe("test_suite");
    if (exceptionCheck?.kind === "test_suite") {
      expect(exceptionCheck.requireRaises).toEqual(["ValueError", "TypeError"]);
    }

    const parametrizeLesson = modulePackage.lessons.find(
      (lesson) => lesson.id === "intermediate.testing.parametrize",
    );
    const parametrizeCheck = parametrizeLesson?.validation.checks.find(
      (check) => check.kind === "test_suite",
    );
    expect(parametrizeCheck?.kind).toBe("test_suite");
    if (parametrizeCheck?.kind === "test_suite") {
      expect(parametrizeCheck.minParametrizeCases).toBe(4);
    }
  });

  it("ships a two-source two-test-file mutation-resistant final", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const paths = finalLesson?.editor.files?.map((file) => file.path) ?? [];
    const suite = finalLesson?.validation.checks.find(
      (check) => check.kind === "test_suite",
    );

    expect(finalLesson?.id).toBe("intermediate.testing.stock-service-final");
    expect(paths).toEqual(
      expect.arrayContaining([
        "stok.py",
        "rapor.py",
        "tests/test_stok.py",
        "tests/test_rapor.py",
      ]),
    );
    expect(suite?.kind).toBe("test_suite");
    if (suite?.kind === "test_suite") {
      expect(suite.testFiles).toHaveLength(2);
      expect(suite.mutants).toHaveLength(5);
      expect(suite.minTests).toBe(6);
      expect(suite.minParametrizeCases).toBe(4);
    }
  });

  it("awards 700 XP across the module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(700);
  });
});
