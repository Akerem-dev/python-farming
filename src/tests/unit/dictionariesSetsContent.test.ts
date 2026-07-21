import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadDictionariesSetsPackage() {
  const filePath = resolve(
    process.cwd(),
    "public/content/modules/dictionaries-sets.json",
  );
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("dictionaries and sets module content", () => {
  const modulePackage = loadDictionariesSetsPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("dictionaries-sets");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("covers prediction, completion, iteration and a data mini project", () => {
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "code-completion")).toBe(true);
    expect(
      modulePackage.lessons.some((lesson) =>
        lesson.validation.checks.some(
          (check) => check.kind === "call" && check.name === "items",
        ),
      ),
    ).toBe(true);
    expect(
      modulePackage.lessons.some(
        (lesson) =>
          lesson.mode === "data-transformation" &&
          Boolean(lesson.dataTransformation?.projectTitle),
      ),
    ).toBe(true);
  });

  it("publishes a three-deliverable stock analyzer project", () => {
    const project = modulePackage.lessons.find(
      (lesson) => lesson.id === "beginner.dictionaries-sets.inventory-mini-project",
    );
    const caseCheck = project?.validation.checks.find(
      (check) => check.kind === "function_cases",
    );

    expect(project?.dataTransformation?.projectTitle).toBe("Stok Analizörü v1");
    expect(project?.dataTransformation?.deliverables).toHaveLength(3);
    expect(project?.dataTransformation?.rules).toHaveLength(4);
    expect(project?.dataTransformation?.workflow).toHaveLength(4);
    expect(
      project?.validation.checks.some(
        (check) => check.kind === "call" && check.name === "add",
      ),
    ).toBe(true);
    expect(
      project?.validation.checks.some(
        (check) => check.kind === "call" && check.name === "append",
      ),
    ).toBe(true);
    expect(caseCheck?.kind).toBe("function_cases");
    if (caseCheck?.kind === "function_cases") {
      expect(caseCheck.cases).toHaveLength(3);
      expect(caseCheck.cases.at(-1)).toEqual({
        args: [[]],
        expected: { toplam_adet: 0, dusuk_stok: [], kategoriler: [] },
      });
    }
  });

  it("ends the beginner path with dictionary and set comprehension validation", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const caseCheck = finalLesson?.validation.checks.find(
      (check) => check.kind === "function_cases",
    );

    expect(finalLesson?.id).toBe("beginner.dictionaries-sets.final-challenge");
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "Dict",
      ),
    ).toBe(true);
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "SetComp",
      ),
    ).toBe(true);
    expect(caseCheck?.kind).toBe("function_cases");
    if (caseCheck?.kind === "function_cases") {
      expect(caseCheck.cases.at(-1)).toEqual({
        args: [{}],
        expected: { ortalama: 0, en_yuksek: null, basarili: [] },
      });
    }
  });

  it("awards 420 XP across the complete module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(420);
  });
});
