import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadOperatorsPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/operators.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("operators module content", () => {
  const modulePackage = loadOperatorsPackage();

  it("publishes six ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("operators");
    expect(modulePackage.lessons).toHaveLength(6);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("contains two output prediction and two code completion lessons", () => {
    expect(
      modulePackage.lessons.filter((lesson) => lesson.mode === "output-prediction"),
    ).toHaveLength(2);
    expect(
      modulePackage.lessons.filter((lesson) => lesson.mode === "code-completion"),
    ).toHaveLength(2);
  });

  it("keeps each prediction answer inside its published options", () => {
    for (const lesson of modulePackage.lessons.filter(
      (candidate) => candidate.mode === "output-prediction",
    )) {
      const optionIds = lesson.choice?.options.map((option) => option.id) ?? [];
      const answer = lesson.validation.answer;
      const correctOptionId = answer?.kind === "choice" ? answer.correctOptionId : null;
      expect(optionIds).toContain(correctOptionId);
    }
  });

  it("ships visible completion markers in code completion starters", () => {
    for (const lesson of modulePackage.lessons.filter(
      (candidate) => candidate.mode === "code-completion",
    )) {
      expect(lesson.editor.starterCode).toContain("__");
    }
  });

  it("awards 260 XP across the complete module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(260);
  });
});
