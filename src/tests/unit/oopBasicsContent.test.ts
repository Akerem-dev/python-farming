import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadOopPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/oop-basics.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("object-oriented basics module content", () => {
  const modulePackage = loadOopPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("oop-basics");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("covers prediction, completion, debugging, encapsulation and object modeling", () => {
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "code-completion")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "debugging")).toBe(true);
    expect(
      modulePackage.lessons.some((lesson) =>
        lesson.validation.checks.some(
          (check) => check.kind === "class_definition" && (check.requiredProperties?.length ?? 0) > 0,
        ),
      ),
    ).toBe(true);
    expect(modulePackage.lessons.at(-1)?.dataTransformation?.projectTitle).toContain("Mağaza");
  });

  it("uses structural class checks and hidden object scenarios", () => {
    const executableLessons = modulePackage.lessons.filter(
      (lesson) => lesson.mode !== "output-prediction",
    );

    for (const lesson of executableLessons) {
      expect(
        lesson.validation.checks.some((check) => check.kind === "class_definition"),
      ).toBe(true);
      expect(lesson.validation.checks.some((check) => check.kind === "class_cases")).toBe(true);
    }
  });

  it("ships a multi-file store domain project", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const paths = finalLesson?.editor.files?.map((file) => file.path) ?? [];

    expect(finalLesson?.id).toBe("intermediate.oop.store-domain-project");
    expect(paths).toEqual(expect.arrayContaining(["main.py", "models.py", "magaza.py"]));
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "class_cases" && check.module === "models",
      ),
    ).toBe(true);
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "class_cases" && check.module === "magaza",
      ),
    ).toBe(true);
  });

  it("awards 650 XP across the complete module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(650);
  });
});
