import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/modules-packages.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("modules and packages content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered intermediate lessons", () => {
    expect(modulePackage.moduleId).toBe("modules-packages");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(modulePackage.lessons.every((lesson) => lesson.id.startsWith("intermediate."))).toBe(true);
  });

  it("ships real multi-file workspaces with valid entrypoints", () => {
    const projectLessons = modulePackage.lessons.filter(
      (lesson) => (lesson.editor.files?.length ?? 0) > 1,
    );

    expect(projectLessons).toHaveLength(5);
    for (const lesson of projectLessons) {
      const paths = lesson.editor.files?.map((file) => file.path) ?? [];
      expect(paths).toContain(lesson.editor.entrypoint);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });

  it("validates files, imports and module-level function cases", () => {
    const projectLessons = modulePackage.lessons.filter(
      (lesson) => (lesson.editor.files?.length ?? 0) > 1,
    );

    expect(
      projectLessons.every((lesson) =>
        lesson.validation.checks.some((check) => check.kind === "import_statement"),
      ),
    ).toBe(true);
    expect(
      projectLessons.every((lesson) =>
        lesson.validation.checks.some(
          (check) => check.kind === "function_cases" && Boolean(check.module),
        ),
      ),
    ).toBe(true);
  });

  it("ends with a four-file package project", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const paths = finalLesson?.editor.files?.map((file) => file.path) ?? [];

    expect(finalLesson?.id).toBe("intermediate.modules-packages.final-project");
    expect(finalLesson?.dataTransformation?.projectTitle).toBe("Stok Paketi v1");
    expect(paths).toEqual([
      "main.py",
      "stok/__init__.py",
      "stok/rapor.py",
      "stok/format.py",
    ]);
    expect(finalLesson?.editor.files?.find((file) => file.path === "main.py")?.readOnly).toBe(true);
  });

  it("awards 500 XP across the module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(500);
  });
});
