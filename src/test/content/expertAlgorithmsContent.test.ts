import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumCatalog, CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/algorithms-complexity.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

function loadCatalog() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/content/curriculum.json"), "utf-8"),
  ) as CurriculumCatalog;
}

function loadPackageIndex() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/content/module-packages.json"), "utf-8"),
  ) as { version: number; files: string[] };
}

describe("expert algorithms and complexity content", () => {
  const modulePackage = loadPackage();

  it("publishes the six-module expert roadmap", () => {
    const expert = loadCatalog().levels.find((level) => level.id === "expert");
    expect(expert?.title).toBe("Uzman Seviye");
    expect(expert?.modules).toHaveLength(6);
    expect(expert?.modules[0]).toMatchObject({
      id: "algorithms-complexity",
      number: "01",
      title: "Algoritmalar ve Karmaşıklık",
    });
    expect(expert?.modules.at(-1)?.id).toBe("expert-project");
  });

  it("registers the expert package in the published package index", () => {
    const index = loadPackageIndex();
    expect(index.files).toContain("/content/modules/algorithms-complexity.json");
    expect(index.files.at(-1)).toBe("/content/modules/algorithms-complexity.json");
  });

  it("publishes seven ordered lessons and 1260 XP", () => {
    expect(modulePackage.moduleId).toBe("algorithms-complexity");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      modulePackage.lessons.reduce((sum, lesson) => sum + lesson.validation.xpReward, 0),
    ).toBe(1260);
  });

  it("covers complexity, binary search, heap selection, BFS and dynamic programming", () => {
    const text = JSON.stringify(modulePackage).toLowerCase();
    for (const keyword of ["big-o", "binary_search", "nlargest", "deque", "lru_cache"]) {
      expect(text).toContain(keyword.toLowerCase());
    }
  });

  it("ships a linear-time performance debugging contract", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "expert.algorithms.duplicate-debug",
    );
    expect(lesson?.mode).toBe("debugging");
    expect(lesson?.debugging?.workflow).toHaveLength(3);
    expect(
      lesson?.validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "For" && check.max === 1,
      ),
    ).toBe(true);
    expect(
      lesson?.validation.checks.some(
        (check) => check.kind === "call" && check.name === "set",
      ),
    ).toBe(true);
  });

  it("uses a six-file final project with hidden behavior scenarios", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.id).toBe("expert.algorithms.final");
    expect(finalLesson?.editor.files).toHaveLength(6);
    expect(finalLesson?.editor.entrypoint).toBe("main.py");
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "function_cases" && check.name === "karar_raporu",
      ),
    ).toBe(true);
  });

  it("calculates expert roadmap progress from real modules", () => {
    const home = readFileSync(
      resolve(process.cwd(), "src/pages/HomePage/HomePage.tsx"),
      "utf-8",
    );
    expect(home).toContain('level.id === "expert"');
    expect(home).toContain("completedExpertModules");
    expect(home).toContain("expertRoadmapProgress");
    expect(home).toContain('? "Uzman Seviye"');
  });
});
