import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadConditionalsPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/conditionals.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("conditionals module content", () => {
  const modulePackage = loadConditionalsPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("conditionals");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("contains prediction, completion, debugging and chapter challenge modes", () => {
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "code-completion")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "debugging")).toBe(true);
    expect(modulePackage.lessons.at(-1)?.levelLabel).toBe("Chapter Challenge");
  });

  it("ships a deliberately broken SyntaxError starter with a debugging workflow", () => {
    const lesson = modulePackage.lessons.find((candidate) => candidate.mode === "debugging");

    expect(lesson?.debugging?.errorType).toBe("SyntaxError");
    expect(lesson?.debugging?.workflow.length).toBeGreaterThanOrEqual(4);
    expect(lesson?.editor.starterCode).toContain("if puan >= 50\n");
    expect(lesson?.editor.starterCode).not.toContain("if puan >= 50:\n");
  });

  it("requires real If AST nodes in every coding condition lesson", () => {
    const codingLessons = modulePackage.lessons.filter(
      (lesson) => lesson.mode !== "output-prediction",
    );

    for (const lesson of codingLessons) {
      expect(
        lesson.validation.checks.some(
          (check) => check.kind === "node_count" && check.nodeName === "If",
        ),
      ).toBe(true);
    }
  });

  it("awards 340 XP across the complete module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(340);
  });
});
