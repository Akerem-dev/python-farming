import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/standard-library.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("standard library module content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("standard-library");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("covers prediction, completion, debugging and multi-file project work", () => {
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "code-completion")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "debugging")).toBe(true);
    expect(modulePackage.lessons.at(-1)?.editor.files).toHaveLength(3);
  });

  it("requires real standard-library runtime types", () => {
    const checks = modulePackage.lessons.flatMap((lesson) => lesson.validation.checks);
    const expectedTypes = checks
      .filter((check) => check.kind === "stdlib_function_cases")
      .flatMap((check) => check.cases.map((testCase) => testCase.expectedType));

    expect(expectedTypes).toContain("date");
    expect(expectedTypes).toContain("Decimal");
    expect(expectedTypes).toContain("Counter");
    expect(expectedTypes).toContain("deque");
  });

  it("publishes strict Enum and cache contracts", () => {
    const checks = modulePackage.lessons.flatMap((lesson) => lesson.validation.checks);
    const enumChecks = checks.filter((check) => check.kind === "enum_definition");
    const decoratorChecks = checks.filter((check) => check.kind === "decorator_usage");

    expect(enumChecks).toHaveLength(2);
    expect(decoratorChecks).toHaveLength(2);
    expect(
      decoratorChecks.every(
        (check) => check.kind === "decorator_usage" && check.accepted.includes("lru_cache"),
      ),
    ).toBe(true);
  });

  it("keeps the final report deterministic and independent of the system clock", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const reportCheck = finalLesson?.validation.checks.find(
      (check) => check.kind === "stdlib_function_cases" && check.name === "zamanlanmis_rapor",
    );

    expect(finalLesson?.editor.starterCode).toContain('"2026-07-22"');
    expect(finalLesson?.task.requirements.join(" ")).toContain("date.today()");
    expect(reportCheck?.kind).toBe("stdlib_function_cases");
    if (reportCheck?.kind === "stdlib_function_cases") {
      expect(reportCheck.cases).toHaveLength(3);
      expect(reportCheck.cases[0]?.expected).toEqual({
        baslangic: "2026-07-16",
        bitis: "2026-07-22",
        satis_sayisi: 2,
        toplam: "300.50",
        kategoriler: { Aksesuar: 1, "Kırtasiye": 1 },
        durum: "hazir",
      });
    }
  });

  it("awards 800 XP across the module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(800);
  });
});
