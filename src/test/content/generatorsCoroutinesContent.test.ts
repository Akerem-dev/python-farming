import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packagePath = resolve(
  process.cwd(),
  "public/content/modules/generators-coroutines.json",
);
const content = JSON.parse(readFileSync(packagePath, "utf-8")) as {
  moduleId: string;
  lessons: Array<{
    id: string;
    order: number;
    mode: string;
    dataTransformation?: {
      projectTitle: string;
      deliverables: string[];
      rules: string[];
      workflow: string[];
    };
    validation: {
      xpReward: number;
      checks: Array<Record<string, unknown>>;
    };
  }>;
};

describe("generators and coroutines curriculum package", () => {
  it("publishes seven ordered lessons with 850 XP", () => {
    expect(content.moduleId).toBe("generators-coroutines");
    expect(content.lessons).toHaveLength(7);
    expect(content.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      content.lessons.reduce((total, lesson) => total + lesson.validation.xpReward, 0),
    ).toBe(850);
  });

  it("covers lazy yield, delegation, send, throw, close and the final pipeline", () => {
    const checks = content.lessons
      .flatMap((lesson) => lesson.validation.checks)
      .filter((check) => check.kind === "advanced_patterns");

    const generators = checks.flatMap(
      (check) => (check.generators as Array<Record<string, unknown>> | undefined) ?? [],
    );
    const scenarios = checks.flatMap(
      (check) => (check.scenarios as Array<Record<string, unknown>> | undefined) ?? [],
    );
    const actions = scenarios.flatMap(
      (scenario) =>
        (scenario.actions as Array<Record<string, unknown>> | undefined) ?? [],
    );

    expect(generators.some((generator) => generator.requireYieldFrom === true)).toBe(true);
    expect(actions.some((action) => action.kind === "send")).toBe(true);
    expect(actions.some((action) => action.kind === "throw")).toBe(true);
    expect(actions.some((action) => action.kind === "close")).toBe(true);
    expect(
      actions.some(
        (action) => action.kind === "state" && action.expected === "GEN_CLOSED",
      ),
    ).toBe(true);

    const finalLesson = content.lessons.at(-1);
    const finalCheck = finalLesson?.validation.checks[0];
    expect(finalLesson?.mode).toBe("data-transformation");
    expect(finalLesson?.dataTransformation?.projectTitle).toBe(
      "Lazy Satış İşleme Hattı",
    );
    expect(finalLesson?.dataTransformation?.deliverables).toHaveLength(4);
    expect(finalLesson?.dataTransformation?.rules).toHaveLength(4);
    expect(finalLesson?.dataTransformation?.workflow).toHaveLength(4);
    expect((finalCheck?.requiredFiles as string[] | undefined)).toEqual([
      "main.py",
      "source.py",
      "pipeline.py",
      "sink.py",
      "service.py",
    ]);
    expect((finalCheck?.functionCases as unknown[] | undefined)?.length).toBe(2);
    expect((finalCheck?.generatedFiles as unknown[] | undefined)?.length).toBe(1);
  });
});
