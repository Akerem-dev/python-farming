import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage, CurriculumModulePackageIndex } from "../../features/curriculum/types";

function loadPackage() {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/parallelism-systems.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

function loadIndex() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/content/module-packages.json"), "utf-8"),
  ) as CurriculumModulePackageIndex;
}

describe("expert parallelism and systems content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered lessons and 1300 XP", () => {
    expect(modulePackage.moduleId).toBe("parallelism-systems");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      modulePackage.lessons.reduce((sum, lesson) => sum + lesson.validation.xpReward, 0),
    ).toBe(1300);
  });

  it("registers the package immediately after the algorithms module", () => {
    const files = loadIndex().files;
    const algorithmIndex = files.indexOf("/content/modules/algorithms-complexity.json");
    expect(algorithmIndex).toBeGreaterThanOrEqual(0);
    expect(files[algorithmIndex + 1]).toBe("/content/modules/parallelism-systems.json");
  });

  it("covers futures, locks, queues and graceful thread shutdown", () => {
    const text = JSON.stringify(modulePackage).toLowerCase();
    for (const keyword of [
      "threadpoolexecutor",
      "as_completed",
      "lock",
      "queue",
      "sentinel",
      "task_done",
    ]) {
      expect(text).toContain(keyword.toLowerCase());
    }
  });

  it("keeps executable laboratories inside the desktop sandbox process policy", () => {
    const executableSource = modulePackage.lessons
      .slice(1)
      .flatMap((lesson) => [
        lesson.editor.starterCode,
        ...(lesson.editor.files?.map((file) => file.starterCode) ?? []),
      ])
      .join("\n");

    expect(executableSource).not.toContain("ProcessPoolExecutor");
    expect(executableSource).not.toContain("multiprocessing");
    expect(executableSource).not.toContain("subprocess");
  });

  it("ships a real race-condition debugging contract", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "expert.parallelism.race-lock",
    );
    expect(lesson?.mode).toBe("debugging");
    expect(lesson?.debugging?.errorType).toBe("RaceCondition");
    expect(lesson?.debugging?.workflow).toHaveLength(3);
    expect(
      lesson?.validation.checks.some(
        (check) => check.kind === "call" && check.name === "Lock",
      ),
    ).toBe(true);
    expect(
      lesson?.validation.checks.some(
        (check) => check.kind === "function_cases" && check.name === "guvenli_sayac",
      ),
    ).toBe(true);
  });

  it("requires complete producer-consumer lifecycle calls", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "expert.parallelism.queue-workers",
    );
    const callNames = lesson?.validation.checks
      .filter((check) => check.kind === "call" || check.kind === "call_count")
      .map((check) => check.name);
    expect(callNames).toEqual(expect.arrayContaining(["put", "get", "task_done", "start", "join"]));
  });

  it("uses a six-file final project with bounded workers and hidden reports", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.id).toBe("expert.parallelism.final");
    expect(finalLesson?.mode).toBe("data-transformation");
    expect(finalLesson?.editor.files).toHaveLength(6);
    expect(finalLesson?.editor.entrypoint).toBe("main.py");
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "function_cases" && check.name === "istasyon_raporu",
      ),
    ).toBe(true);
    expect(
      finalLesson?.validation.checks.some(
        (check) =>
          check.kind === "file_content_regex" &&
          check.path === "paralel_lab/pipeline.py" &&
          check.pattern.includes("max_workers"),
      ),
    ).toBe(true);
  });
});
