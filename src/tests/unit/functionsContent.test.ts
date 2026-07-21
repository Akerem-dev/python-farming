import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadFunctionsPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/functions.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("functions module content", () => {
  const modulePackage = loadFunctionsPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("functions");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("contains prediction, completion, debugging and refactoring practice", () => {
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "code-completion")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "debugging")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "refactoring")).toBe(true);
  });

  it("uses named function definitions and hidden cases in executable function lessons", () => {
    const executableLessons = modulePackage.lessons.filter(
      (lesson) => lesson.mode !== "output-prediction",
    );

    expect(
      executableLessons.every((lesson) =>
        lesson.validation.checks.some((check) => check.kind === "function_definition"),
      ),
    ).toBe(true);

    expect(
      executableLessons
        .filter((lesson) => lesson.order > 1)
        .every((lesson) =>
          lesson.validation.checks.some((check) => check.kind === "function_cases"),
        ),
    ).toBe(true);
  });

  it("requires exactly one default parameter in default-argument lessons", () => {
    const defaultLessons = modulePackage.lessons.filter((lesson) =>
      ["beginner.functions.default-arguments", "beginner.functions.final-challenge"].includes(
        lesson.id,
      ),
    );

    for (const lesson of defaultLessons) {
      const signatureCheck = lesson.validation.checks.find(
        (check) => check.kind === "function_definition",
      );
      expect(signatureCheck?.kind).toBe("function_definition");
      if (signatureCheck?.kind === "function_definition") {
        expect(signatureCheck.minDefaults).toBe(1);
        expect(signatureCheck.maxDefaults).toBe(1);
        expect(signatureCheck.requireReturn).toBe(true);
      }
    }
  });

  it("publishes a strict three-call refactoring task", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.mode === "refactoring",
    );
    const callCheck = lesson?.validation.checks.find(
      (check) => check.kind === "call_count" && check.name === "urun_toplami",
    );

    expect(lesson?.refactoring?.workflow).toHaveLength(4);
    expect(lesson?.editor.starterCode.match(/\*/g)).toHaveLength(3);
    expect(callCheck?.kind).toBe("call_count");
    if (callCheck?.kind === "call_count") {
      expect(callCheck.min).toBe(3);
      expect(callCheck.max).toBe(3);
    }
  });

  it("awards 380 XP across the complete module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(380);
  });
});
