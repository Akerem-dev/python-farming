import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/databases-advanced.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

describe("advanced databases module content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered advanced lessons", () => {
    expect(modulePackage.moduleId).toBe("databases-advanced");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("awards 1000 XP", () => {
    const total = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(total).toBe(1000);
  });

  it("covers parameter binding, foreign keys, transactions and indexes", () => {
    const checks = modulePackage.lessons.flatMap(
      (lesson) => lesson.validation.checks,
    );
    expect(
      checks.some(
        (check) =>
          check.kind === "file_content_regex" &&
          check.pattern.includes("foreign_keys"),
      ),
    ).toBe(true);
    expect(
      checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "With",
      ),
    ).toBe(true);
    expect(
      checks.some(
        (check) =>
          check.kind === "file_content_regex" &&
          check.pattern.includes("CREATE\\s+INDEX"),
      ),
    ).toBe(true);
    expect(
      checks.some(
        (check) =>
          check.kind === "file_content_regex" && check.pattern.includes("\\?"),
      ),
    ).toBe(true);
  });

  it("ships a layered migration, repository and service final project", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.editor.files?.map((file) => file.path)).toEqual([
      "main.py",
      "database.py",
      "repository.py",
      "service.py",
      "migrations/001_init.txt",
    ]);
    expect(finalLesson?.mode).toBe("data-transformation");
    const hiddenCases = finalLesson?.validation.checks.find(
      (check) => check.kind === "function_cases" && check.name === "senaryo_calistir",
    );
    expect(hiddenCases?.kind).toBe("function_cases");
    if (hiddenCases?.kind === "function_cases") {
      expect(hiddenCases.cases).toHaveLength(3);
    }
  });

  it("requires both transaction and nested iteration structure in the final", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const checks = finalLesson?.validation.checks ?? [];
    expect(
      checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "With",
      ),
    ).toBe(true);
    expect(
      checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "For",
      ),
    ).toBe(true);
  });
});
