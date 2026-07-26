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

  it("publishes seven ordered advanced lessons", () => {
    expect(modulePackage.moduleId).toBe("architecture-patterns");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("awards 1060 XP", () => {
    expect(
      modulePackage.lessons.reduce((sum, lesson) => sum + lesson.validation.xpReward, 0),
    ).toBe(1060);
  });

  it("covers DI, strategy, factory, adapter, repository and service layers", () => {
    const text = JSON.stringify(modulePackage).toLowerCase();
    for (const keyword of ["dependency", "strategy", "factory", "adapter", "repository", "service"]) {
      expect(text).toContain(keyword);
    }
  });

  it("leaves dependency injection work for the learner", () => {
    const lesson = modulePackage.lessons.find((candidate) => candidate.id === "advanced.arch.di");
    expect(lesson?.editor.starterCode).toContain("self.bildirimci = Bildirimci()");
    expect(lesson?.validation.checks.some((check) => check.kind === "function_cases")).toBe(true);
    expect(lesson?.validation.checks.some((check) => check.kind === "file_content_regex")).toBe(true);
  });

  it("validates factory and adapter behavior instead of signatures only", () => {
    for (const id of ["advanced.arch.factory", "advanced.arch.adapter"]) {
      const lesson = modulePackage.lessons.find((candidate) => candidate.id === id);
      expect(lesson?.validation.checks.some((check) => check.kind === "function_cases")).toBe(true);
    }
  });

  it("keeps the tight-coupling debugging guide complete", () => {
    const debuggingLesson = modulePackage.lessons.find(
      (lesson) => lesson.id === "advanced.arch.coupling",
    );
    expect(debuggingLesson?.mode).toBe("debugging");
    expect(debuggingLesson?.debugging?.errorType).toBe("TightCoupling");
    expect(debuggingLesson?.debugging?.workflow).toHaveLength(3);
    expect(
      debuggingLesson?.validation.checks.some(
        (check) => check.kind === "call_count" && check.name === "Repository" && check.max === 0,
      ),
    ).toBe(true);
  });

  it("ships an eight-file final project on the project validator path", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.editor.files).toHaveLength(8);
    expect(finalLesson?.editor.entrypoint).toBe("main.py");
    expect(finalLesson?.validation.checks.some((check) => check.kind === "class_definition")).toBe(false);
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "function_cases" && check.name === "senaryo_calistir",
      ),
    ).toBe(true);
    expect(
      finalLesson?.validation.checks.filter((check) => check.kind === "file_content_regex").length,
    ).toBeGreaterThanOrEqual(8);
  });
});
