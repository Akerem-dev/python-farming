import { describe, expect, it } from "vitest";
import type { CurriculumCatalog } from "../../features/curriculum/types";
import {
  expertGraduationLessonId,
  getExpertGraduationSnapshot,
} from "../../features/mastery/expertGraduation";

const coreModules = Array.from({ length: 5 }, (_, index) => ({
  id: `expert-module-${index + 1}`,
  number: String(index + 1).padStart(2, "0"),
  title: `Uzman Modül ${index + 1}`,
  lessonIds: [`expert.module-${index + 1}.lesson`],
}));

const catalog: CurriculumCatalog = {
  version: 1,
  levels: [
    {
      id: "expert",
      title: "Uzman Seviye",
      modules: [
        ...coreModules,
        {
          id: "expert-project",
          number: "06",
          title: "Uzman Bitirme Projesi",
          lessonIds: [expertGraduationLessonId],
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
      levelLabel: "Expert",
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
      id: expertGraduationLessonId,
      moduleId: "expert-project",
      order: 1,
      title: "Güvenilir Kod Analiz Platformu",
      summary: "Uzman Seviye Bitirme Projesi",
      levelLabel: "Graduation",
      task: {
        title: "Güvenilir Kod Analiz Platformu",
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
        id: expertGraduationLessonId,
        title: "Güvenilir Kod Analiz Platformu",
        xpReward: 500,
        timeoutMs: 1000,
        checks: [],
      },
    },
  ],
};

describe("expert graduation", () => {
  it("keeps the capstone locked while identifying weak expert modules", () => {
    const snapshot = getExpertGraduationSnapshot(catalog, [coreModules[0]!.lessonIds[0]!]);

    expect(snapshot.projectUnlocked).toBe(false);
    expect(snapshot.graduated).toBe(false);
    expect(snapshot.curriculumCompleted).toBe(false);
    expect(snapshot.completedCoreModules).toBe(1);
    expect(snapshot.weakTopics).toHaveLength(3);
  });

  it("awards 95 mastery points after five expert modules", () => {
    const completed = coreModules.flatMap((module) => module.lessonIds);
    const snapshot = getExpertGraduationSnapshot(catalog, completed);

    expect(snapshot.projectUnlocked).toBe(true);
    expect(snapshot.graduated).toBe(false);
    expect(snapshot.curriculumCompleted).toBe(false);
    expect(snapshot.masteryScore).toBe(95);
    expect(snapshot.completedCoreModules).toBe(5);
    expect(snapshot.totalCoreModules).toBe(5);
  });

  it("awards the expert badge and completes the full curriculum", () => {
    const completed = [
      ...coreModules.flatMap((module) => module.lessonIds),
      expertGraduationLessonId,
    ];
    const snapshot = getExpertGraduationSnapshot(catalog, completed);

    expect(snapshot.graduated).toBe(true);
    expect(snapshot.curriculumCompleted).toBe(true);
    expect(snapshot.masteryScore).toBe(100);
    expect(snapshot.badgeName).toBe("Python Farming Uzman Seviye Mezunu");
  });
});
