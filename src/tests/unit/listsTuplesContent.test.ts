import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadListsTuplesPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/lists-tuples.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("lists and tuples module content", () => {
  const modulePackage = loadListsTuplesPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("lists-tuples");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("contains prediction, completion, debugging and data transformation practice", () => {
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "code-completion")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "debugging")).toBe(true);
    expect(
      modulePackage.lessons.some((lesson) => lesson.mode === "data-transformation"),
    ).toBe(true);
  });

  it("ships a tuple debugging lesson with slicing validation", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "beginner.lists-tuples.tuple-debugging",
    );

    expect(lesson?.debugging?.errorType).toBe("TypeError");
    expect(
      lesson?.validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "Slice",
      ),
    ).toBe(true);
    expect(
      lesson?.validation.checks.some(
        (check) =>
          check.kind === "variable_type" &&
          check.name === "ayarlar" &&
          check.expectedType === "tuple",
      ),
    ).toBe(true);
  });

  it("validates the data laboratory with structure and hidden list cases", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.mode === "data-transformation",
    );
    const caseCheck = lesson?.validation.checks.find(
      (check) => check.kind === "function_cases",
    );

    expect(lesson?.dataTransformation?.rules).toHaveLength(3);
    expect(lesson?.dataTransformation?.workflow).toHaveLength(4);
    expect(
      lesson?.validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "For",
      ),
    ).toBe(true);
    expect(
      lesson?.validation.checks.some(
        (check) => check.kind === "call" && check.name === "append",
      ),
    ).toBe(true);
    expect(caseCheck?.kind).toBe("function_cases");
    if (caseCheck?.kind === "function_cases") {
      expect(caseCheck.cases).toEqual([
        { args: [[100, 250, 400]], expected: [120, 300, 480] },
        { args: [[50, 75]], expected: [60, 90] },
        { args: [[]], expected: [] },
      ]);
    }
  });

  it("ends with a tuple-based collection summary challenge", () => {
    const lesson = modulePackage.lessons.at(-1);

    expect(lesson?.id).toBe("beginner.lists-tuples.final-challenge");
    expect(
      lesson?.validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "Tuple",
      ),
    ).toBe(true);
    expect(
      lesson?.validation.checks.filter(
        (check) => check.kind === "call" && ["min", "max", "len"].includes(check.name),
      ),
    ).toHaveLength(3);
  });

  it("awards 395 XP across the complete module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(395);
  });
});
