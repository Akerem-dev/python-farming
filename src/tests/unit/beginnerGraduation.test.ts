import { describe, expect, it } from "vitest";
import type {
  CurriculumCatalog,
  CurriculumLesson,
  CurriculumModule,
} from "../../features/curriculum/types";
import {
  beginnerGraduationLessonId,
  getBeginnerGraduationLesson,
  getBeginnerGraduationSnapshot,
} from "../../features/mastery/beginnerGraduation";

function createLesson(id: string, moduleId: string, order = 1): CurriculumLesson {
  return {
    id,
    moduleId,
    order,
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
    validation: {
      id,
      title: id,
      xpReward: 1,
      timeoutMs: 1000,
      checks: [],
    },
  };
}

const coreModules: CurriculumModule[] = Array.from({ length: 8 }, (_, index) => ({
  id: `module-${index + 1}`,
  number: String(index + 1).padStart(2, "0"),
  title: `Modül ${index + 1}`,
  lessonIds: [`lesson-${index + 1}`],
}));

const graduationModule: CurriculumModule = {
  id: "beginner-graduation",
  number: "EX",
  title: "Başlangıç Mezuniyeti",
  lessonIds: [beginnerGraduationLessonId],
};

const catalog: CurriculumCatalog = {
  version: 1,
  levels: [
    {
      id: "beginner",
      title: "Başlangıç",
      modules: [...coreModules, graduationModule],
    },
  ],
  lessons: [
    ...coreModules.map((module, index) =>
      createLesson(`lesson-${index + 1}`, module.id),
    ),
    createLesson(beginnerGraduationLessonId, graduationModule.id),
  ],
};

const coreLessonIds = coreModules.flatMap((module) => module.lessonIds);

describe("beginner graduation mastery", () => {
  it("keeps the exam locked and reports weak modules before core completion", () => {
    const snapshot = getBeginnerGraduationSnapshot(catalog, ["lesson-1", "lesson-2"]);

    expect(snapshot.examUnlocked).toBe(false);
    expect(snapshot.graduated).toBe(false);
    expect(snapshot.intermediateUnlocked).toBe(false);
    expect(snapshot.completedCoreModules).toBe(2);
    expect(snapshot.weakTopics).toHaveLength(3);
    expect(snapshot.masteryScore).toBeLessThan(95);
  });

  it("unlocks the exam at 95 mastery after all eight core modules", () => {
    const snapshot = getBeginnerGraduationSnapshot(catalog, coreLessonIds);

    expect(snapshot.completedCoreLessons).toBe(8);
    expect(snapshot.completedCoreModules).toBe(8);
    expect(snapshot.examUnlocked).toBe(true);
    expect(snapshot.graduated).toBe(false);
    expect(snapshot.masteryScore).toBe(95);
    expect(snapshot.weakTopics).toEqual([]);
  });

  it("awards full mastery, badge state and intermediate access after the exam", () => {
    const snapshot = getBeginnerGraduationSnapshot(catalog, [
      ...coreLessonIds,
      beginnerGraduationLessonId,
    ]);

    expect(snapshot.graduated).toBe(true);
    expect(snapshot.intermediateUnlocked).toBe(true);
    expect(snapshot.masteryScore).toBe(100);
    expect(snapshot.badgeName).toBe("Python Farming Başlangıç Mezunu");
  });

  it("finds the published graduation lesson", () => {
    expect(getBeginnerGraduationLesson(catalog)?.id).toBe(beginnerGraduationLessonId);
  });
});
