import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CurriculumCatalog,
  CurriculumModulePackage,
} from "../../features/curriculum/types";

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf-8")) as T;
}

describe("decorators and context managers module content", () => {
  const modulePackage = readJson<CurriculumModulePackage>(
    "public/content/modules/decorators-context-managers.json",
  );
  const catalog = readJson<CurriculumCatalog>("public/content/curriculum.json");

  it("publishes seven ordered advanced lessons", () => {
    expect(modulePackage.moduleId).toBe("decorators-context-managers");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(modulePackage.lessons.every((lesson) => lesson.levelLabel === "Advanced Learning")).toBe(
      true,
    );
  });

  it("covers prediction, completion, debugging and file processing", () => {
    const modes = modulePackage.lessons.map((lesson) => lesson.mode);
    expect(modes).toContain("output-prediction");
    expect(modes).toContain("code-completion");
    expect(modes).toContain("debugging");
    expect(modes).toContain("file-processing");
  });

  it("requires real decorator and context manager contracts", () => {
    const checks = modulePackage.lessons.flatMap((lesson) => lesson.validation.checks);
    const decoratorChecks = checks.filter((check) => check.kind === "decorator_contract");
    const contextChecks = checks.filter((check) => check.kind === "context_manager_contract");

    expect(decoratorChecks).toHaveLength(3);
    expect(contextChecks).toHaveLength(2);
    expect(
      decoratorChecks.some(
        (check) =>
          check.kind === "decorator_contract" && check.parameterized && check.requireWraps,
      ),
    ).toBe(true);
    expect(
      contextChecks.some(
        (check) =>
          check.kind === "context_manager_contract" && check.implementation === "class",
      ),
    ).toBe(true);
    expect(
      contextChecks.some(
        (check) =>
          check.kind === "context_manager_contract" && check.implementation === "generator",
      ),
    ).toBe(true);
  });

  it("publishes a strict multi-file resource management final", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const projectCheck = finalLesson?.validation.checks.find(
      (check) => check.kind === "resource_management_project",
    );

    expect(finalLesson?.editor.files).toHaveLength(5);
    expect(finalLesson?.editor.files?.some((file) => file.path === "data/islemler.json")).toBe(true);
    expect(projectCheck?.kind).toBe("resource_management_project");
    if (projectCheck?.kind === "resource_management_project") {
      expect(projectCheck.requiredFiles).toEqual([
        "main.py",
        "decorators.py",
        "resources.py",
        "service.py",
        "data/islemler.json",
      ]);
      expect(projectCheck.decoratorName).toBe("audit");
      expect(projectCheck.contextManagerName).toBe("JsonKaynak");
    }
  });

  it("adds eight advanced and six expert roadmap modules", () => {
    const advanced = catalog.levels.find((level) => level.id === "advanced");
    const expert = catalog.levels.find((level) => level.id === "expert");

    expect(advanced?.modules).toHaveLength(8);
    expect(advanced?.modules[0]?.id).toBe("decorators-context-managers");
    expect(expert?.modules).toHaveLength(6);
  });

  it("awards 800 XP across the module", () => {
    expect(
      modulePackage.lessons.reduce((sum, lesson) => sum + lesson.validation.xpReward, 0),
    ).toBe(800);
  });
});
