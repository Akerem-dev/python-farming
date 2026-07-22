import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadModulePackage() {
  const filePath = resolve(
    process.cwd(),
    "public/content/modules/classes-inheritance.json",
  );
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("classes and inheritance module content", () => {
  const modulePackage = loadModulePackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("classes-inheritance");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("covers prediction, completion, debugging and project practice", () => {
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "code-completion")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "debugging")).toBe(true);
    expect(
      modulePackage.lessons.filter((lesson) => lesson.mode === "data-transformation"),
    ).toHaveLength(2);
  });

  it("requires inheritance, overrides and super calls structurally", () => {
    const classChecks = modulePackage.lessons.flatMap((lesson) =>
      lesson.validation.checks.filter((check) => check.kind === "class_definition"),
    );

    expect(
      classChecks.some(
        (check) =>
          check.kind === "class_definition" &&
          check.name === "Yazilimci" &&
          check.requiredBases?.includes("Calisan"),
      ),
    ).toBe(true);
    expect(
      classChecks.some(
        (check) =>
          check.kind === "class_definition" &&
          check.requiredOverrides?.includes("ucret"),
      ),
    ).toBe(true);
    expect(
      classChecks.some(
        (check) =>
          check.kind === "class_definition" &&
          check.requiredSuperCalls?.includes("__init__"),
      ),
    ).toBe(true);
  });

  it("requires real classmethod and staticmethod decorators", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "intermediate.inheritance.class-static-methods",
    );
    const classCheck = lesson?.validation.checks.find(
      (check) => check.kind === "class_definition" && check.name === "Komisyon",
    );

    expect(classCheck?.kind).toBe("class_definition");
    if (classCheck?.kind === "class_definition") {
      expect(classCheck.requiredClassMethods).toEqual(["oran_ayarla"]);
      expect(classCheck.requiredStaticMethods).toEqual(["tutar_gecerli"]);
    }
  });

  it("ships polymorphic hidden object scenarios", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "intermediate.inheritance.polymorphism-lab",
    );
    const cases = lesson?.validation.checks.find(
      (check) => check.kind === "class_cases" && check.name === "KargoSepeti",
    );

    expect(lesson?.dataTransformation?.projectTitle).toContain("Kargo");
    expect(cases?.kind).toBe("class_cases");
    if (cases?.kind === "class_cases") {
      expect(cases.cases).toHaveLength(3);
    }
  });

  it("publishes a multi-file payment system final", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const paths = finalLesson?.editor.files?.map((file) => file.path) ?? [];

    expect(finalLesson?.id).toBe("intermediate.inheritance.payment-system-final");
    expect(paths).toEqual(expect.arrayContaining(["main.py", "models.py", "processor.py"]));
    expect(
      finalLesson?.validation.checks.some(
        (check) =>
          check.kind === "class_definition" &&
          check.name === "KrediKarti" &&
          check.requiredBases?.includes("Odeme") &&
          check.requiredSuperCalls?.includes("__init__"),
      ),
    ).toBe(true);
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "class_cases" && check.module === "processor",
      ),
    ).toBe(true);
  });

  it("awards 720 XP across the complete module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(720);
  });
});
