import { describe, expect, it } from "vitest";
import type { CurriculumCatalog } from "../../features/curriculum/types";
import {
  getIntermediateGraduationSnapshot,
  intermediateGraduationLessonId,
} from "../../features/mastery/intermediateGraduation";

const coreModules = Array.from({ length: 9 }, (_, index) => ({
  id: `module-${index + 1}`,
  number: String(index + 1).padStart(2, "0"),
  title: `Modül ${index + 1}`,
  lessonIds: [`intermediate.module-${index + 1}.lesson`],
}));

const catalog: CurriculumCatalog = {
  version: 1,
  levels: [
    {
      id: "intermediate",
      title: "Orta Seviye",
      modules: [
        ...coreModules,
        {
          id: "intermediate-project",
          number: "10",
          title: "Orta Seviye Projesi",
          lessonIds: [intermediateGraduationLessonId],
        },
      ],
    },
  ],
  lessons: [
    ...coreModules.map((module) => ({
      id: module.lessonIds[0]!,
      moduleId: module.id,
      order: 1,
      title: module.title,
      summary: module.title,
      levelLabel: "Intermediate",
      task: {
        title: module.title,
        instructions: [],
        requirements: [],
        sampleOutput: "",
        stdinEnabled: false,
        stdinPlaceholder: "",
        defaultStdin: "",
      },
      editor: { filename: "main.py", starterCode: "" },
      hints: [],
      validation: {
        id: module.lessonIds[0]!,
        title: module.title,
        xpReward: 1,
        timeoutMs: 1000,
        checks: [],
      },
    })),
    {
      id: intermediateGraduationLessonId,
      moduleId: "intermediate-project",
      order: 1,
      title: "Bitirme Projesi",
      summary: "Bitirme Projesi",
      levelLabel: "Graduation",
      task: {
        title: "Bitirme Projesi",
        instructions: [],
        requirements: [],
        sampleOutput: "",
        stdinEnabled: false,
        stdinPlaceholder: "",
        defaultStdin: "",
      },
      editor: { filename: "main.py", starterCode: "" },
      hints: [],
      validation: {
        id: intermediateGraduationLessonId,
        title: "Bitirme Projesi",
        xpReward: 300,
        timeoutMs: 1000,
        checks: [],
      },
    },
  ],
};

describe("intermediate graduation", () => {
  it("keeps the capstone locked while identifying weak modules", () => {
    const snapshot = getIntermediateGraduationSnapshot(catalog, [coreModules[0]!.lessonIds[0]!]);

    expect(snapshot.projectUnlocked).toBe(false);
    expect(snapshot.graduated).toBe(false);
    expect(snapshot.advancedUnlocked).toBe(false);
    expect(snapshot.completedCoreModules).toBe(1);
    expect(snapshot.weakTopics).toHaveLength(3);
  });

  it("awards 95 mastery points and unlocks the project after nine core modules", () => {
    const completed = coreModules.flatMap((module) => module.lessonIds);
    const snapshot = getIntermediateGraduationSnapshot(catalog, completed);

    expect(snapshot.projectUnlocked).toBe(true);
    expect(snapshot.graduated).toBe(false);
    expect(snapshot.masteryScore).toBe(95);
    expect(snapshot.completedCoreModules).toBe(9);
    expect(snapshot.totalCoreModules).toBe(9);
  });

  it("awards the badge and unlocks Advanced after the capstone", () => {
    const completed = [
      ...coreModules.flatMap((module) => module.lessonIds),
      intermediateGraduationLessonId,
    ];
    const snapshot = getIntermediateGraduationSnapshot(catalog, completed);

    expect(snapshot.graduated).toBe(true);
    expect(snapshot.advancedUnlocked).toBe(true);
    expect(snapshot.masteryScore).toBe(100);
    expect(snapshot.badgeName).toBe("Python Farming Orta Seviye Mezunu");
  });
});
