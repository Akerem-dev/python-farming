import { describe, expect, it } from "vitest";
import {
  getModuleAccessState,
  getResumeLesson,
  isLessonUnlocked,
  isModuleCompleted,
} from "../../features/curriculum/curriculumProgress";
import type { CurriculumCatalog } from "../../features/curriculum/types";

const catalog: CurriculumCatalog = {
  version: 1,
  levels: [
    {
      id: "beginner",
      title: "Başlangıç",
      modules: [
        {
          id: "variables",
          number: "01",
          title: "Değişkenler",
          lessonIds: ["lesson-1", "lesson-2", "lesson-3"],
        },
        {
          id: "operators",
          number: "02",
          title: "Operatörler",
          lessonIds: ["lesson-4"],
        },
        {
          id: "loops",
          number: "03",
          title: "Döngüler",
          lessonIds: [],
        },
      ],
    },
  ],
  lessons: [
    {
      id: "lesson-1",
      moduleId: "variables",
      order: 1,
      title: "Bir",
      summary: "",
      levelLabel: "Başlangıç",
      task: {
        title: "",
        instructions: [],
        requirements: [],
        sampleOutput: "",
        stdinEnabled: false,
        stdinPlaceholder: "",
        defaultStdin: "",
      },
      editor: { filename: "main.py", starterCode: "" },
      hints: [],
      validation: { id: "lesson-1", title: "", xpReward: 10, timeoutMs: 1000, checks: [] },
    },
    {
      id: "lesson-2",
      moduleId: "variables",
      order: 2,
      title: "İki",
      summary: "",
      levelLabel: "Başlangıç",
      task: {
        title: "",
        instructions: [],
        requirements: [],
        sampleOutput: "",
        stdinEnabled: false,
        stdinPlaceholder: "",
        defaultStdin: "",
      },
      editor: { filename: "main.py", starterCode: "" },
      hints: [],
      validation: { id: "lesson-2", title: "", xpReward: 10, timeoutMs: 1000, checks: [] },
    },
    {
      id: "lesson-3",
      moduleId: "variables",
      order: 3,
      title: "Üç",
      summary: "",
      levelLabel: "Başlangıç",
      task: {
        title: "",
        instructions: [],
        requirements: [],
        sampleOutput: "",
        stdinEnabled: false,
        stdinPlaceholder: "",
        defaultStdin: "",
      },
      editor: { filename: "main.py", starterCode: "" },
      hints: [],
      validation: { id: "lesson-3", title: "", xpReward: 10, timeoutMs: 1000, checks: [] },
    },
    {
      id: "lesson-4",
      moduleId: "operators",
      order: 1,
      title: "Dört",
      summary: "",
      levelLabel: "Başlangıç",
      task: {
        title: "",
        instructions: [],
        requirements: [],
        sampleOutput: "",
        stdinEnabled: false,
        stdinPlaceholder: "",
        defaultStdin: "",
      },
      editor: { filename: "main.py", starterCode: "" },
      hints: [],
      validation: { id: "lesson-4", title: "", xpReward: 10, timeoutMs: 1000, checks: [] },
    },
  ],
};

describe("curriculum progress rules", () => {
  it("keeps the second lesson locked until the first one is complete", () => {
    expect(isLessonUnlocked(catalog, "lesson-1", [])).toBe(true);
    expect(isLessonUnlocked(catalog, "lesson-2", [])).toBe(false);
    expect(isLessonUnlocked(catalog, "lesson-2", ["lesson-1"])).toBe(true);
  });

  it("locks the next module until the current module is complete", () => {
    expect(isLessonUnlocked(catalog, "lesson-4", ["lesson-1", "lesson-2"])).toBe(false);
    expect(isLessonUnlocked(catalog, "lesson-4", ["lesson-1", "lesson-2", "lesson-3"])).toBe(true);
  });

  it("selects the first unlocked incomplete lesson as the resume target", () => {
    expect(getResumeLesson(catalog, ["lesson-1"], "lesson-1")?.id).toBe("lesson-2");
  });

  it("derives module completion from persisted lesson completion", () => {
    const module = catalog.levels[0]?.modules[0];
    expect(module && isModuleCompleted(module, ["lesson-1", "lesson-2", "lesson-3"])).toBe(true);
  });

  it("marks modules without published lessons as coming soon", () => {
    const module = catalog.levels[0]?.modules[2];
    expect(module && getModuleAccessState(catalog, module, [], null)).toBe("coming-soon");
  });
});
