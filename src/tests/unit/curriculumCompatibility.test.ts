import { describe, expect, it } from "vitest";
import {
  getNextLesson,
  getResumeLesson,
  isLessonUnlocked,
} from "../../features/curriculum/curriculumProgress";
import type {
  CurriculumCatalog,
  CurriculumLesson,
} from "../../features/curriculum/types";

function createLesson(id: string, moduleId: string, order: number): CurriculumLesson {
  return {
    id,
    moduleId,
    order,
    title: id,
    summary: "",
    levelLabel: "Başlangıç",
    task: {
      title: id,
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
      id,
      title: id,
      xpReward: 10,
      timeoutMs: 1000,
      checks: [],
    },
  };
}

const catalog: CurriculumCatalog = {
  version: 2,
  levels: [
    {
      id: "beginner",
      title: "Başlangıç",
      modules: [
        {
          id: "introduction",
          number: "01",
          title: "Python’a Giriş",
          lessonIds: ["intro-1", "intro-2"],
        },
        {
          id: "variables",
          number: "02",
          title: "Değişkenler",
          lessonIds: ["variables-1", "variables-2"],
        },
      ],
    },
  ],
  lessons: [
    createLesson("intro-1", "introduction", 1),
    createLesson("intro-2", "introduction", 2),
    createLesson("variables-1", "variables", 1),
    createLesson("variables-2", "variables", 2),
  ],
};

describe("curriculum compatibility", () => {
  it("starts a new learner at the first introduction lesson", () => {
    expect(isLessonUnlocked(catalog, "intro-1", [])).toBe(true);
    expect(isLessonUnlocked(catalog, "intro-2", [])).toBe(false);
    expect(isLessonUnlocked(catalog, "variables-1", [])).toBe(false);
    expect(getResumeLesson(catalog, [], null)?.id).toBe("intro-1");
  });

  it("unlocks variables only after the introduction module is complete", () => {
    expect(isLessonUnlocked(catalog, "variables-1", ["intro-1"])).toBe(false);
    expect(isLessonUnlocked(catalog, "variables-1", ["intro-1", "intro-2"])).toBe(true);
  });

  it("keeps lessons completed in an older version open for review", () => {
    const legacyProgress = ["variables-1", "variables-2"];
    expect(isLessonUnlocked(catalog, "variables-1", legacyProgress)).toBe(true);
    expect(isLessonUnlocked(catalog, "variables-2", legacyProgress)).toBe(true);
    expect(getResumeLesson(catalog, legacyProgress, "variables-2")?.id).toBe("intro-1");
  });

  it("skips legacy-completed lessons after the final introduction lesson", () => {
    const completed = ["intro-1", "intro-2", "variables-1", "variables-2"];
    expect(getNextLesson(catalog, "intro-2", completed)).toBeNull();
  });

  it("continues into the first incomplete lesson of the next module", () => {
    const completed = ["intro-1", "intro-2"];
    expect(getNextLesson(catalog, "intro-2", completed)?.id).toBe("variables-1");
  });
});
