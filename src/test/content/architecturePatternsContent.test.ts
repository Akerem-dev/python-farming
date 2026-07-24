import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/architecture-patterns.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

describe("architecture patterns module content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("architecture-patterns");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("awards 1080 XP", () => {
    const total = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(total).toBe(1080);
  });

  it("covers DI, repository, strategy, factory, adapter and service layer", () => {
    const text = JSON.stringify(modulePackage);
    for (const concept of [
      "dependency injection",
      "Repository",
      "Strategy",
      "Factory",
      "Adapter",
      "Service layer",
    ]) {
      expect(text.toLowerCase()).toContain(concept.toLowerCase());
    }

    expect(
      modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction"),
    ).toBe(true);
    expect(
      modulePackage.lessons.some((lesson) => lesson.mode === "debugging"),
    ).toBe(true);
    expect(
      modulePackage.lessons.some((lesson) => lesson.mode === "refactoring"),
    ).toBe(true);
  });

  it("ships a six-file layered final project with hidden scenarios", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.editor.files?.map((file) => file.path)).toEqual([
      "main.py",
      "domain.py",
      "ports.py",
      "adapters.py",
      "strategies.py",
      "service.py",
    ]);

    const hiddenCases = finalLesson?.validation.checks.find(
      (check) =>
        check.kind === "function_cases" && check.name === "uygulama_raporu",
    );
    expect(hiddenCases?.kind).toBe("function_cases");
    if (hiddenCases?.kind === "function_cases") {
      expect(hiddenCases.cases).toHaveLength(3);
    }

    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "For",
      ),
    ).toBe(true);
  });
});
