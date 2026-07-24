import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  const path = resolve(process.cwd(), "public/content/modules/async-await.json");
  return JSON.parse(readFileSync(path, "utf-8")) as CurriculumModulePackage;
}

describe("async and await module content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered advanced lessons", () => {
    expect(modulePackage.moduleId).toBe("async-await");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("awards 920 XP and includes prediction, debugging and multi-file work", () => {
    const xp = modulePackage.lessons.reduce(
      (total, lesson) => total + lesson.validation.xpReward,
      0,
    );
    expect(xp).toBe(920);
    expect(
      modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction"),
    ).toBe(true);
    expect(
      modulePackage.lessons.some((lesson) => lesson.mode === "debugging"),
    ).toBe(true);
    expect(modulePackage.lessons.at(-1)?.editor.files).toHaveLength(3);
  });

  it("uses real async programming quality gates", () => {
    const executableLessons = modulePackage.lessons.filter(
      (lesson) => lesson.validation.answer === undefined,
    );
    for (const lesson of executableLessons) {
      expect(
        lesson.validation.checks.some(
          (check) => check.kind === "async_programming",
        ),
      ).toBe(true);
    }

    const finalCheck = modulePackage.lessons
      .at(-1)
      ?.validation.checks.find((check) => check.kind === "async_programming");
    expect(finalCheck?.kind).toBe("async_programming");
    if (finalCheck?.kind === "async_programming") {
      const calls = finalCheck.asyncFunctions?.flatMap(
        (fn) => fn.requiredCalls ?? [],
      );
      expect(calls).toEqual(
        expect.arrayContaining([
          "asyncio.Semaphore",
          "asyncio.create_task",
          "asyncio.gather",
          "asyncio.wait_for",
        ]),
      );
      expect(finalCheck.scenarios).toHaveLength(2);
    }
  });
});
