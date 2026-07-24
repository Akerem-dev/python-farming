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

  it("publishes seven ordered lessons worth 880 XP", () => {
    expect(modulePackage.moduleId).toBe("async-await");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(
      modulePackage.lessons.reduce(
        (total, lesson) => total + lesson.validation.xpReward,
        0,
      ),
    ).toBe(880);
  });

  it("covers prediction, completion, debugging and a multi-file final", () => {
    const modes = new Set(modulePackage.lessons.map((lesson) => lesson.mode));
    expect(modes.has("output-prediction")).toBe(true);
    expect(modes.has("code-completion")).toBe(true);
    expect(modes.has("debugging")).toBe(true);

    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.editor.files?.map((file) => file.path)).toEqual([
      "main.py",
      "telemetry.py",
      "session.py",
    ]);
  });

  it("requires real asyncio coordination primitives", () => {
    const checks = modulePackage.lessons.flatMap((lesson) => lesson.validation.checks);
    const rawChecks = checks as unknown as Array<Record<string, unknown>>;

    expect(rawChecks.some((check) => check.requireGather === true)).toBe(true);
    expect(rawChecks.some((check) => check.requireCreateTask === true)).toBe(true);
    expect(rawChecks.some((check) => check.requireWaitFor === true)).toBe(true);
    expect(rawChecks.some((check) => check.requireSemaphore === true)).toBe(true);
    expect(rawChecks.some((check) => check.requireAsyncContextManager === true)).toBe(true);
    expect(rawChecks.every((check) => check.kind === "advanced_patterns")).toBe(true);
  });
});
