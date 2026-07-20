import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadLoopsPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/loops.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("loops module content", () => {
  const modulePackage = loadLoopsPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("loops");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("contains output prediction, code ordering and debugging practice", () => {
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "code-ordering")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "debugging")).toBe(true);
  });

  it("publishes a valid shuffled code ordering lesson", () => {
    const lesson = modulePackage.lessons.find((candidate) => candidate.mode === "code-ordering");
    const blockIds = lesson?.ordering?.blocks.map((block) => block.id) ?? [];
    const correctIds = lesson?.validation.answer?.kind === "order"
      ? lesson.validation.answer.correctBlockIds
      : [];

    expect(blockIds).toEqual(["loop", "done", "body", "header"]);
    expect(correctIds).toEqual(["header", "loop", "body", "done"]);
    expect(new Set(blockIds)).toEqual(new Set(correctIds));
  });

  it("requires real loop AST nodes across code and debugging lessons", () => {
    const loopLessons = modulePackage.lessons.filter(
      (lesson) => lesson.mode === "code" || lesson.mode === "debugging",
    );

    expect(
      loopLessons.every((lesson) =>
        lesson.validation.checks.some(
          (check) => check.kind === "node_count" && ["For", "While"].includes(check.nodeName),
        ),
      ),
    ).toBe(true);
  });

  it("awards 360 XP across the complete module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(360);
  });
});
