import { beforeEach, describe, expect, it } from "vitest";
import { useCurriculumStore } from "../../features/curriculum/store/curriculumStore";
import type { CurriculumCatalog } from "../../features/curriculum/types";

const catalog: CurriculumCatalog = {
  version: 1,
  levels: [],
  lessons: [
    {
      id: "lesson-1",
      moduleId: "module",
      order: 1,
      title: "Bir",
      summary: "",
      levelLabel: "Beginner",
      task: {
        title: "Bir",
        instructions: [],
        requirements: [],
        sampleOutput: "",
        stdinEnabled: false,
        stdinPlaceholder: "",
        defaultStdin: "",
      },
      editor: { filename: "main.py", starterCode: "" },
      hints: [],
      validation: { id: "lesson-1", title: "Bir", xpReward: 10, timeoutMs: 1000, checks: [] },
    },
    {
      id: "lesson-2",
      moduleId: "module",
      order: 2,
      title: "İki",
      summary: "",
      levelLabel: "Beginner",
      task: {
        title: "İki",
        instructions: [],
        requirements: [],
        sampleOutput: "",
        stdinEnabled: false,
        stdinPlaceholder: "",
        defaultStdin: "",
      },
      editor: { filename: "main.py", starterCode: "" },
      hints: [],
      validation: { id: "lesson-2", title: "İki", xpReward: 10, timeoutMs: 1000, checks: [] },
    },
  ],
};

describe("curriculumStore", () => {
  beforeEach(() => {
    useCurriculumStore.setState({
      status: "ready",
      catalog,
      currentLessonId: "lesson-1",
      errorMessage: null,
    });
  });

  it("moves to the next lesson", () => {
    useCurriculumStore.getState().selectNextLesson();
    expect(useCurriculumStore.getState().currentLessonId).toBe("lesson-2");
  });

  it("moves back to the previous lesson", () => {
    useCurriculumStore.setState({ currentLessonId: "lesson-2" });
    useCurriculumStore.getState().selectPreviousLesson();
    expect(useCurriculumStore.getState().currentLessonId).toBe("lesson-1");
  });

  it("ignores unknown lesson ids", () => {
    useCurriculumStore.getState().selectLesson("missing");
    expect(useCurriculumStore.getState().currentLessonId).toBe("lesson-1");
  });
});
