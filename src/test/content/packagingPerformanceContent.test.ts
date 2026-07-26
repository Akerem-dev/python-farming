import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/packaging-performance.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

describe("packaging and performance module content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("packaging-performance");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("awards 1060 XP", () => {
    expect(
      modulePackage.lessons.reduce((sum, lesson) => sum + lesson.validation.xpReward, 0),
    ).toBe(1060);
  });

  it("covers timeit, profiling, memory, caching and package API contracts", () => {
    const text = JSON.stringify(modulePackage).toLowerCase();
    for (const keyword of ["timeit", "cprofile", "pstats", "tracemalloc", "lru_cache", "__all__", "__version__"]) {
      expect(text).toContain(keyword.toLowerCase());
    }
  });

  it("ships a complete performance debugging guide", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "advanced.performance.quadratic-debug",
    );
    expect(lesson?.mode).toBe("debugging");
    expect(lesson?.debugging?.errorType).toBe("PerformanceSmell");
    expect(lesson?.debugging?.workflow).toHaveLength(3);
    expect(
      lesson?.validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "For" && check.max === 1,
      ),
    ).toBe(true);
  });

  it("uses a six-file final project with deterministic hidden reports", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.editor.files).toHaveLength(6);
    expect(finalLesson?.editor.entrypoint).toBe("main.py");
    expect(finalLesson?.mode).toBe("data-transformation");
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "function_cases" && check.name === "performans_raporu",
      ),
    ).toBe(true);
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "For" && check.max === 1,
      ),
    ).toBe(true);
  });
});
