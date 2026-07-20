import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeModulePackages } from "../../features/curriculum/services/curriculumService";
import type {
  CurriculumCatalog,
  CurriculumModulePackage,
} from "../../features/curriculum/types";

function readJson<T>(relativePath: string): T {
  const absolutePath = resolve(process.cwd(), relativePath);
  return JSON.parse(readFileSync(absolutePath, "utf8")) as T;
}

describe("packaged curriculum content", () => {
  const baseCatalog = readJson<CurriculumCatalog>("public/content/curriculum.json");
  const introductionPackage = readJson<CurriculumModulePackage>(
    "public/content/modules/python-introduction.json",
  );
  const mergedCatalog = mergeModulePackages(baseCatalog, [introductionPackage]);

  it("publishes five ordered Python introduction lessons", () => {
    const module = mergedCatalog.levels[0]?.modules.find(
      (item) => item.id === "python-introduction",
    );
    const lessons = mergedCatalog.lessons.filter(
      (lesson) => lesson.moduleId === "python-introduction",
    );

    expect(module?.lessonIds).toEqual([
      "beginner.introduction.first-output",
      "beginner.introduction.values",
      "beginner.introduction.expressions",
      "beginner.introduction.comments-order",
      "beginner.introduction.fix-syntax",
    ]);
    expect(lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps lesson ids unique across packaged and legacy content", () => {
    const ids = mergedCatalog.lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(mergedCatalog.lessons).toHaveLength(8);
  });

  it("awards 170 XP across the introduction module", () => {
    const total = mergedCatalog.lessons
      .filter((lesson) => lesson.moduleId === "python-introduction")
      .reduce((sum, lesson) => sum + lesson.validation.xpReward, 0);
    expect(total).toBe(170);
  });

  it("uses call count checks for beginner print exercises", () => {
    const lessons = mergedCatalog.lessons.filter(
      (lesson) => lesson.moduleId === "python-introduction",
    );
    expect(
      lessons.every((lesson) =>
        lesson.validation.checks.some((check) => check.kind === "call_count"),
      ),
    ).toBe(true);
  });
});
