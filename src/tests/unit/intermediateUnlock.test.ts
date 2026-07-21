import { describe, expect, it } from "vitest";
import {
  getModuleAccessState,
  isLessonUnlocked,
  isModuleUnlocked,
} from "../../features/curriculum/curriculumProgress";
import type { CurriculumCatalog, CurriculumLesson } from "../../features/curriculum/types";

function lesson(id: string, moduleId: string): CurriculumLesson {
  return {
    id,
    moduleId,
    order: 1,
    title: id,
    summary: id,
    levelLabel: "Test",
    task: {
      title: id,
      instructions: ["test"],
      requirements: ["test"],
      sampleOutput: "test",
      stdinEnabled: false,
      stdinPlaceholder: "",
      defaultStdin: "",
    },
    editor: { filename: "main.py", starterCode: "" },
    hints: [],
    validation: { id, title: id, xpReward: 1, timeoutMs: 1000, checks: [] },
  };
}

const catalog: CurriculumCatalog = {
  version: 1,
  levels: [
    {
      id: "beginner",
      title: "Başlangıç",
      modules: [
        { id: "core", number: "01", title: "Temel", lessonIds: ["beginner.core"] },
        {
          id: "beginner-graduation",
          number: "EX",
          title: "Mezuniyet",
          lessonIds: ["beginner.graduation.final"],
        },
      ],
    },
    {
      id: "intermediate",
      title: "Orta Seviye",
      modules: [
        {
          id: "modules-packages",
          number: "01",
          title: "Modüller",
          lessonIds: ["intermediate.modules.first"],
        },
      ],
    },
  ],
  lessons: [
    lesson("beginner.core", "core"),
    lesson("beginner.graduation.final", "beginner-graduation"),
    lesson("intermediate.modules.first", "modules-packages"),
  ],
};

const intermediateModule = catalog.levels[1]!.modules[0]!;

describe("intermediate curriculum access", () => {
  it("stays locked before the graduation exam is complete", () => {
    expect(isModuleUnlocked(catalog, intermediateModule.id, ["beginner.core"])).toBe(false);
    expect(
      isLessonUnlocked(catalog, "intermediate.modules.first", ["beginner.core"]),
    ).toBe(false);
    expect(
      getModuleAccessState(catalog, intermediateModule, ["beginner.core"], null),
    ).toBe("locked");
  });

  it("opens immediately after graduation is recorded", () => {
    const completed = ["beginner.core", "beginner.graduation.final"];
    expect(isModuleUnlocked(catalog, intermediateModule.id, completed)).toBe(true);
    expect(isLessonUnlocked(catalog, "intermediate.modules.first", completed)).toBe(true);
    expect(getModuleAccessState(catalog, intermediateModule, completed, null)).toBe("available");
  });
});
