import { describe, expect, it } from "vitest";
import type { CurriculumCatalog } from "../../features/curriculum/types";
import {
  advancedGraduationLessonId,
  getAdvancedGraduationSnapshot,
} from "../../features/mastery/advancedGraduation";

const coreModules = Array.from({ length: 7 }, (_, index) => ({
  id: `advanced-module-${index + 1}`,
  number: String(index + 1).padStart(2, "0"),
  title: `İleri Modül ${index + 1}`,
  lessonIds: [`advanced.module-${index + 1}.lesson`],
}));

const catalog: CurriculumCatalog = {
  version: 1,
  levels: [
    {
      id: "advanced",
      title: "İleri Seviye",
      modules: [
        ...coreModules,
        {
          id: "advanced-project",
          number: "08",
          title: "İleri Seviye Projesi",
          lessonIds: [advancedGraduationLessonId],
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
      levelLabel: "Advanced",
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
      id: advancedGraduationLessonId,
      moduleId: "advanced-project",
      order: 1,
      title: "Yerel Veri Platformu",
      summary: "İleri Seviye Bitirme Projesi",
      levelLabel: "Graduation",
      task: {
        title: "Yerel Veri Platformu",
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
        id: advancedGraduationLessonId,
        title: "Yerel Veri Platformu",
        xpReward: 500,
        timeoutMs: 1000,
        checks: [],
      },
    },
  ],
};

describe("advanced graduation", () => {
  it("keeps the final platform locked while identifying weak modules", () => {
    const snapshot = getAdvancedGraduationSnapshot(catalog, [coreModules[0]!.lessonIds[0]!]);

    expect(snapshot.projectUnlocked).toBe(false);
    expect(snapshot.graduated).toBe(false);
    expect(snapshot.expertUnlocked).toBe(false);
    expect(snapshot.completedCoreModules).toBe(1);
    expect(snapshot.weakTopics).toHaveLength(3);
  });

  it("awards 95 mastery points after seven advanced modules", () => {
    const completed = coreModules.flatMap((module) => module.lessonIds);
    const snapshot = getAdvancedGraduationSnapshot(catalog, completed);

    expect(snapshot.projectUnlocked).toBe(true);
    expect(snapshot.graduated).toBe(false);
    expect(snapshot.expertUnlocked).toBe(false);
    expect(snapshot.masteryScore).toBe(95);
    expect(snapshot.completedCoreModules).toBe(7);
    expect(snapshot.totalCoreModules).toBe(7);
  });

  it("awards the badge and unlocks Expert after the final platform", () => {
    const completed = [
      ...coreModules.flatMap((module) => module.lessonIds),
      advancedGraduationLessonId,
    ];
    const snapshot = getAdvancedGraduationSnapshot(catalog, completed);

    expect(snapshot.graduated).toBe(true);
    expect(snapshot.expertUnlocked).toBe(true);
    expect(snapshot.masteryScore).toBe(100);
    expect(snapshot.badgeName).toBe("Python Farming İleri Seviye Mezunu");
  });
});
