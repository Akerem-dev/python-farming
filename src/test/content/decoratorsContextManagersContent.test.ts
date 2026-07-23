import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function readPackage() {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/decorators-context-managers.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

describe("decorators and context managers content", () => {
  it("publishes seven ordered advanced lessons worth 820 XP", () => {
    const packageData = readPackage();
    expect(packageData.moduleId).toBe("decorators-context-managers");
    expect(packageData.lessons).toHaveLength(7);
    expect(packageData.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      packageData.lessons.reduce((total, lesson) => total + lesson.validation.xpReward, 0),
    ).toBe(820);
  });

  it("covers wraps, parameterized decorators and both context manager forms", () => {
    const lessons = readPackage().lessons;
    const checks = lessons.flatMap((lesson) => lesson.validation.checks);
    const patternChecks = checks.filter((check) => check.kind === "advanced_patterns");

    expect(patternChecks).toHaveLength(6);
    expect(
      patternChecks.some(
        (check) =>
          check.kind === "advanced_patterns" &&
          check.decorators?.some((decorator) => decorator.parameterized && decorator.requireWraps),
      ),
    ).toBe(true);
    expect(
      patternChecks.some(
        (check) =>
          check.kind === "advanced_patterns" &&
          check.contextManagers?.some((manager) => manager.implementation === "class"),
      ),
    ).toBe(true);
    expect(
      patternChecks.some(
        (check) =>
          check.kind === "advanced_patterns" &&
          check.contextManagers?.some((manager) => manager.implementation === "generator"),
      ),
    ).toBe(true);
  });
});
