import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadModulePackage() {
  const filePath = resolve(
    process.cwd(),
    "public/content/modules/comprehensions-iterators.json",
  );
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("comprehensions and iterators module content", () => {
  const modulePackage = loadModulePackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("comprehensions-iterators");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("covers every comprehension family used by the module", () => {
    const nodeNames = modulePackage.lessons.flatMap((lesson) =>
      lesson.validation.checks
        .filter((check) => check.kind === "node_count")
        .map((check) => (check.kind === "node_count" ? check.nodeName : "")),
    );

    expect(nodeNames).toEqual(
      expect.arrayContaining(["ListComp", "DictComp", "SetComp", "GeneratorExp"]),
    );
  });

  it("requires explicit StopIteration handling in the debugging lesson", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "intermediate.iterators.stop-iteration-debugging",
    );
    const exceptionCheck = lesson?.validation.checks.find(
      (check) => check.kind === "exception_handling",
    );

    expect(lesson?.mode).toBe("debugging");
    expect(exceptionCheck?.kind).toBe("exception_handling");
    if (exceptionCheck?.kind === "exception_handling") {
      expect(exceptionCheck.requiredTypes).toEqual(["StopIteration"]);
      expect(exceptionCheck.disallowBareExcept).toBe(true);
    }
  });

  it("ships a strict custom iterator protocol exercise", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "intermediate.iterators.custom-iterator",
    );
    const functionNames = lesson?.validation.checks
      .filter((check) => check.kind === "function_definition")
      .map((check) => (check.kind === "function_definition" ? check.name : ""));

    expect(functionNames).toEqual(expect.arrayContaining(["__iter__", "__next__", "geri_say"]));
    expect(
      lesson?.validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "Raise",
      ),
    ).toBe(true);
  });

  it("publishes a yield-based lazy stream final without list comprehensions", () => {
    const lesson = modulePackage.lessons.at(-1);
    const yieldCheck = lesson?.validation.checks.find(
      (check) => check.kind === "node_count" && check.nodeName === "Yield",
    );
    const noListCheck = lesson?.validation.checks.find(
      (check) => check.kind === "node_count" && check.nodeName === "ListComp",
    );

    expect(lesson?.id).toBe("intermediate.iterators.lazy-stream-final");
    expect(lesson?.mode).toBe("data-transformation");
    expect(lesson?.dataTransformation?.deliverables).toHaveLength(4);
    expect(yieldCheck?.kind).toBe("node_count");
    expect(noListCheck?.kind).toBe("node_count");
    if (noListCheck?.kind === "node_count") {
      expect(noListCheck.min).toBe(0);
      expect(noListCheck.max).toBe(0);
    }
  });

  it("awards 580 XP across the complete module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(580);
  });
});
