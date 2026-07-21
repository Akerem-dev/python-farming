import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadGraduationPackage() {
  const filePath = resolve(
    process.cwd(),
    "public/content/modules/beginner-graduation.json",
  );
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("beginner graduation content", () => {
  const modulePackage = loadGraduationPackage();
  const lesson = modulePackage.lessons[0];

  it("publishes one assessment outside the eight core modules", () => {
    expect(modulePackage.moduleId).toBe("beginner-graduation");
    expect(modulePackage.lessons).toHaveLength(1);
    expect(lesson?.id).toBe("beginner.graduation.final-exam");
    expect(lesson?.mode).toBe("data-transformation");
  });

  it("covers all beginner topics and a visible graduation contract", () => {
    expect(lesson?.graduation?.topics).toHaveLength(8);
    expect(lesson?.graduation?.criteria).toHaveLength(4);
    expect(lesson?.graduation?.badgeName).toBe("Python Farming Başlangıç Mezunu");
    expect(lesson?.graduation?.nextLevel).toBe("Orta Seviye");
    expect(lesson?.dataTransformation?.deliverables).toHaveLength(4);
  });

  it("requires function, loop, condition, dictionary and set structures", () => {
    const checks = lesson?.validation.checks ?? [];

    expect(checks.some((check) => check.kind === "function_definition")).toBe(true);
    expect(
      checks.some((check) => check.kind === "node_count" && check.nodeName === "For"),
    ).toBe(true);
    expect(
      checks.some((check) => check.kind === "node_count" && check.nodeName === "If"),
    ).toBe(true);
    expect(
      checks.some((check) => check.kind === "node_count" && check.nodeName === "Dict"),
    ).toBe(true);
    expect(
      checks.some((check) => check.kind === "call" && check.name === "add"),
    ).toBe(true);
  });

  it("uses four comprehensive hidden scenarios including custom threshold and empty data", () => {
    const caseCheck = lesson?.validation.checks.find(
      (check) => check.kind === "function_cases",
    );

    expect(caseCheck?.kind).toBe("function_cases");
    if (caseCheck?.kind === "function_cases") {
      expect(caseCheck.cases).toHaveLength(4);
      expect(caseCheck.cases.at(-1)).toEqual({
        args: [[]],
        expected: {
          envanter_degeri: 0,
          kritik_urunler: [],
          kategoriler: [],
          en_degerli_urun: null,
        },
      });
      expect(caseCheck.cases.some((testCase) => testCase.args.length === 2)).toBe(true);
    }
  });

  it("awards 150 XP for the final assessment", () => {
    expect(lesson?.validation.xpReward).toBe(150);
  });
});
